#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信聊天记录解密工具 - Windows版
用于解密微信本地数据库并导出聊天记录
"""

import os
import sys
import json
import ctypes
import struct
import sqlite3
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

# Windows specific imports
try:
    import pymem
    import pymem.process
    PYMEM_AVAILABLE = True
except ImportError:
    PYMEM_AVAILABLE = False

# 颜色输出 (Windows)
class Colors:
    HEADER = ''
    BLUE = ''
    CYAN = ''
    GREEN = ''
    WARNING = ''
    FAIL = ''
    END = ''
    BOLD = ''

# 尝试启用Windows颜色
if sys.platform == 'win32':
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        Colors.HEADER = '\033[95m'
        Colors.BLUE = '\033[94m'
        Colors.CYAN = '\033[96m'
        Colors.GREEN = '\033[92m'
        Colors.WARNING = '\033[93m'
        Colors.FAIL = '\033[91m'
        Colors.END = '\033[0m'
        Colors.BOLD = '\033[1m'
    except:
        pass

def print_header(text: str):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(60)}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}[+] {text}{Colors.END}")

def print_error(text: str):
    print(f"{Colors.FAIL}[-] {text}{Colors.END}")

def print_warning(text: str):
    print(f"{Colors.WARNING}[!] {text}{Colors.END}")

def print_info(text: str):
    print(f"{Colors.CYAN}[*] {text}{Colors.END}")

# Windows微信版本偏移量 (不同版本可能需要调整)
VERSION_OFFSETS = {
    '3.9.9': {'key_offset': 0x25E4D98, 'base_name': 'WeChatWin.dll'},
    '3.9.8': {'key_offset': 0x25E0D98, 'base_name': 'WeChatWin.dll'},
    '3.9.7': {'key_offset': 0x25D8D98, 'base_name': 'WeChatWin.dll'},
    '3.9.6': {'key_offset': 0x25CECC8, 'base_name': 'WeChatWin.dll'},
    '3.9.5': {'key_offset': 0x25C9CC8, 'base_name': 'WeChatWin.dll'},
    'default': {'key_offset': 0x25E4D98, 'base_name': 'WeChatWin.dll'},
}

def get_wechat_path() -> Optional[Path]:
    """获取微信数据目录"""
    # 常见路径
    possible_paths = [
        Path(os.environ.get('USERPROFILE', '')) / 'Documents' / 'WeChat Files',
        Path('C:/Users') / os.environ.get('USERNAME', '') / 'Documents' / 'WeChat Files',
    ]
    
    for base_path in possible_paths:
        if base_path.exists():
            # 查找用户目录 (wxid_xxx 格式)
            user_dirs = [d for d in base_path.iterdir() if d.is_dir() and d.name.startswith('wxid_')]
            
            if not user_dirs:
                # 尝试其他格式的用户目录
                user_dirs = [d for d in base_path.iterdir() if d.is_dir() and (d / 'Msg').exists()]
            
            if user_dirs:
                if len(user_dirs) == 1:
                    return user_dirs[0]
                
                # 多用户选择
                print_info("发现多个用户目录:")
                for i, d in enumerate(user_dirs):
                    print(f"  [{i+1}] {d.name}")
                
                while True:
                    try:
                        choice = int(input(f"\n请选择用户 [1-{len(user_dirs)}]: "))
                        if 1 <= choice <= len(user_dirs):
                            return user_dirs[choice - 1]
                    except ValueError:
                        pass
                    print_warning("无效选择，请重试")
    
    print_error("未找到微信数据目录")
    return None

def find_db_files(wechat_path: Path) -> List[Path]:
    """查找所有数据库文件"""
    db_files = []
    
    # MSG目录
    msg_path = wechat_path / "Msg"
    if msg_path.exists():
        # 主消息数据库
        multi_path = msg_path / "Multi"
        if multi_path.exists():
            db_files.extend(multi_path.glob("MSG*.db"))
        
        # MicroMsg.db (联系人等)
        micro_msg = msg_path / "MicroMsg.db"
        if micro_msg.exists():
            db_files.append(micro_msg)
    
    return sorted(db_files, key=lambda x: x.name)

def get_wechat_version() -> Optional[str]:
    """获取微信版本"""
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Tencent\WeChat")
        version, _ = winreg.QueryValueEx(key, "Version")
        winreg.CloseKey(key)
        # 转换版本号
        v = struct.unpack('BBBB', struct.pack('>I', version))
        return f"{v[0]}.{v[1]}.{v[2]}"
    except:
        return None

def get_key_from_memory() -> Optional[bytes]:
    """从微信进程内存中获取密钥"""
    if not PYMEM_AVAILABLE:
        print_error("pymem 未安装，请运行: pip install pymem")
        return None
    
    try:
        pm = pymem.Pymem("WeChat.exe")
        print_success(f"已附加到微信进程 (PID: {pm.process_id})")
        
        # 获取WeChatWin.dll基址
        module = pymem.process.module_from_name(pm.process_handle, "WeChatWin.dll")
        if not module:
            print_error("未找到WeChatWin.dll")
            return None
        
        base_addr = module.lpBaseOfDll
        print_info(f"WeChatWin.dll 基址: {hex(base_addr)}")
        
        # 获取版本
        version = get_wechat_version()
        print_info(f"微信版本: {version or '未知'}")
        
        # 获取偏移量
        offsets = VERSION_OFFSETS.get(version, VERSION_OFFSETS['default'])
        key_offset = offsets['key_offset']
        
        # 读取密钥地址
        key_addr = pm.read_longlong(base_addr + key_offset)
        
        # 读取32字节密钥
        key = pm.read_bytes(key_addr, 32)
        
        pm.close_process()
        return key
        
    except pymem.exception.ProcessNotFound:
        print_error("微信未运行，请先启动微信")
    except Exception as e:
        print_error(f"读取内存失败: {e}")
    
    return None

def search_key_in_memory() -> Optional[bytes]:
    """在内存中搜索密钥（备用方法）"""
    if not PYMEM_AVAILABLE:
        return None
    
    try:
        pm = pymem.Pymem("WeChat.exe")
        
        # 搜索模式：密钥通常跟在特定字符串后面
        # 这是一个简化的搜索，实际可能需要更复杂的模式匹配
        
        print_info("正在搜索内存中的密钥...")
        
        # 暂不实现复杂的内存搜索
        pm.close_process()
        
    except Exception as e:
        print_error(f"内存搜索失败: {e}")
    
    return None

def decrypt_database(db_path: Path, key: bytes, output_dir: Path) -> Optional[Path]:
    """解密数据库"""
    output_path = output_dir / f"{db_path.stem}_decrypted.db"
    
    try:
        # 读取加密数据库
        with open(db_path, 'rb') as f:
            encrypted_data = f.read()
        
        # SQLCipher参数
        page_size = 4096
        iter_count = 64000
        salt_size = 16
        
        # 获取salt
        salt = encrypted_data[:salt_size]
        
        # 导入解密库
        try:
            from Crypto.Cipher import AES
            from Crypto.Protocol.KDF import PBKDF2
            from hashlib import sha1
            import hmac
        except ImportError:
            print_error("请安装 pycryptodome: pip install pycryptodome")
            return None
        
        # 派生密钥
        derived_key = PBKDF2(key, salt, dkLen=32, count=iter_count, prf=lambda p, s: hmac.new(p, s, sha1).digest())
        
        # 解密数据
        decrypted_data = bytearray()
        
        # 添加SQLite文件头
        sqlite_header = b'SQLite format 3\x00'
        
        num_pages = len(encrypted_data) // page_size
        
        for page_num in range(num_pages):
            offset = page_num * page_size
            page_data = encrypted_data[offset:offset + page_size]
            
            if page_num == 0:
                # 第一页特殊处理
                iv = page_data[16:32]
                encrypted_content = page_data[32:page_size - 32]
                mac = page_data[page_size - 32:page_size - 12]
            else:
                iv = page_data[:16]
                encrypted_content = page_data[16:page_size - 32]
                mac = page_data[page_size - 32:page_size - 12]
            
            # AES解密
            cipher = AES.new(derived_key, AES.MODE_CBC, iv)
            try:
                decrypted_page = cipher.decrypt(encrypted_content)
                
                if page_num == 0:
                    decrypted_data.extend(sqlite_header)
                    decrypted_data.extend(b'\x00' * (16 - len(sqlite_header)))
                    decrypted_data.extend(decrypted_page)
                else:
                    decrypted_data.extend(iv)
                    decrypted_data.extend(decrypted_page)
                    
            except Exception:
                # 解密失败，保留原始数据
                decrypted_data.extend(page_data)
        
        # 写入解密后的数据
        with open(output_path, 'wb') as f:
            f.write(decrypted_data)
        
        # 验证是否是有效的SQLite数据库
        try:
            conn = sqlite3.connect(str(output_path))
            conn.execute("SELECT count(*) FROM sqlite_master")
            conn.close()
            return output_path
        except:
            os.remove(output_path)
            return None
            
    except Exception as e:
        print_error(f"解密失败: {e}")
        return None

def extract_messages(db_path: Path) -> List[Dict[str, Any]]:
    """从解密的数据库中提取消息"""
    messages = []
    
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 获取所有表名
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        # 查找消息表
        msg_tables = [t for t in tables if 'MSG' in t.upper()]
        
        for table in msg_tables:
            try:
                cursor.execute(f"SELECT StrContent, CreateTime, StrTalker, Type, IsSend FROM {table}")
                
                for row in cursor.fetchall():
                    if row[0]:  # 有内容
                        messages.append({
                            'content': row[0],
                            'timestamp': row[1],
                            'sender': row[2],
                            'type': row[3],
                            'isSelf': row[4] == 1
                        })
            except Exception:
                continue
        
        conn.close()
    except Exception as e:
        print_error(f"读取数据库失败: {e}")
    
    return messages

def extract_contacts(db_path: Path) -> Dict[str, str]:
    """提取联系人信息"""
    contacts = {}
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT UserName, NickName FROM Contact")
            for row in cursor.fetchall():
                if row[0] and row[1]:
                    contacts[row[0]] = row[1]
        except:
            pass
            
        conn.close()
    except:
        pass
    
    return contacts

def export_to_json(messages: List[Dict], contacts: Dict, output_path: Path) -> Tuple[int, int]:
    """导出为JSON格式"""
    # 按会话分组
    sessions = {}
    
    for msg in messages:
        sender = msg.get('sender', 'unknown')
        if sender not in sessions:
            sessions[sender] = {
                'id': sender,
                'name': contacts.get(sender, sender),
                'messages': [],
                'isGroup': '@chatroom' in sender
            }
        
        sessions[sender]['messages'].append({
            'id': str(len(sessions[sender]['messages'])),
            'content': msg.get('content', ''),
            'timestamp': msg.get('timestamp', 0) * 1000 if msg.get('timestamp') else 0,
            'isSelf': msg.get('isSelf', False),
            'senderName': '我' if msg.get('isSelf') else contacts.get(sender, sender),
            'type': get_message_type(msg.get('type', 1))
        })
    
    # 转换为列表并排序
    result = list(sessions.values())
    for session in result:
        session['messages'].sort(key=lambda x: x['timestamp'])
        session['messageCount'] = len(session['messages'])
        if session['messages']:
            session['lastMessage'] = session['messages'][-1]['content'][:50]
            session['lastMessageTime'] = session['messages'][-1]['timestamp']
    
    result.sort(key=lambda x: x.get('lastMessageTime', 0), reverse=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    return len(result), sum(s['messageCount'] for s in result)

def get_message_type(type_code) -> str:
    """转换消息类型"""
    type_map = {
        1: 'text',
        3: 'image',
        34: 'voice',
        43: 'video',
        47: 'emoji',
        49: 'file',
        10000: 'system',
        10002: 'system'
    }
    return type_map.get(type_code, 'text')

def manual_key_input() -> Optional[bytes]:
    """手动输入密钥"""
    print_info("请输入32字节十六进制密钥 (64个字符):")
    key_hex = input().strip().replace(' ', '').replace('0x', '')
    
    try:
        if len(key_hex) == 64:
            return bytes.fromhex(key_hex)
    except:
        pass
    
    print_error("密钥格式错误")
    return None

def main():
    print_header("微信聊天记录解密工具 - Windows版")
    
    # 检查是否为Windows
    if sys.platform != 'win32':
        print_error("此脚本仅支持Windows系统")
        print_info("macOS用户请使用 decrypt_macos.py")
        sys.exit(1)
    
    # 获取微信路径
    wechat_path = get_wechat_path()
    if not wechat_path:
        sys.exit(1)
    
    print_success(f"用户目录: {wechat_path.name}")
    
    # 查找数据库文件
    db_files = find_db_files(wechat_path)
    if not db_files:
        print_error("未找到数据库文件")
        sys.exit(1)
    
    print_success(f"找到 {len(db_files)} 个数据库文件")
    
    # 获取密钥
    print()
    print_info("选择密钥获取方式:")
    print("  [1] 从微信进程内存读取 (需要管理员权限)")
    print("  [2] 手动输入密钥")
    
    choice = input("\n请选择 [1-2]: ").strip()
    
    key = None
    if choice == '1':
        key = get_key_from_memory()
    elif choice == '2':
        key = manual_key_input()
    
    if not key:
        print_error("未获取到有效密钥")
        sys.exit(1)
    
    print_success(f"密钥: {key.hex()[:16]}...")
    
    # 创建输出目录
    output_dir = Path.cwd() / "wechat_decrypted"
    output_dir.mkdir(exist_ok=True)
    
    # 保存密钥
    with open(output_dir / "key.txt", 'w') as f:
        f.write(key.hex())
    
    # 解密数据库
    print_header("解密数据库")
    
    all_messages = []
    contacts = {}
    decrypted_count = 0
    
    for db_file in db_files:
        print_info(f"解密: {db_file.name}")
        
        decrypted_path = decrypt_database(db_file, key, output_dir)
        
        if decrypted_path:
            print_success(f"  -> {decrypted_path.name}")
            decrypted_count += 1
            
            # 提取数据
            if 'MicroMsg' in db_file.name:
                contacts.update(extract_contacts(decrypted_path))
            else:
                messages = extract_messages(decrypted_path)
                all_messages.extend(messages)
                print_info(f"    提取 {len(messages)} 条消息")
        else:
            print_warning(f"  解密失败")
    
    print()
    print_success(f"成功解密 {decrypted_count}/{len(db_files)} 个数据库")
    
    # 导出JSON
    if all_messages:
        print_header("导出数据")
        json_path = output_dir / "chat_records.json"
        session_count, msg_count = export_to_json(all_messages, contacts, json_path)
        print_success(f"导出完成: {json_path}")
        print_info(f"  {session_count} 个会话, {msg_count} 条消息")
    
    print()
    print_header("完成")
    print(f"输出目录: {output_dir}")

if __name__ == "__main__":
    main()

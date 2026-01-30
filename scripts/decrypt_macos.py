#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信聊天记录解密工具 - macOS版
用于解密微信本地数据库并导出聊天记录
"""

import os
import sys
import json
import shutil
import sqlite3
import subprocess
import glob
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

# 颜色输出
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(60)}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✓ {text}{Colors.END}")

def print_error(text: str):
    print(f"{Colors.FAIL}✗ {text}{Colors.END}")

def print_warning(text: str):
    print(f"{Colors.WARNING}⚠ {text}{Colors.END}")

def print_info(text: str):
    print(f"{Colors.CYAN}→ {text}{Colors.END}")

def get_wechat_path() -> Optional[Path]:
    """获取微信数据目录"""
    base_path = Path.home() / "Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat"
    
    if not base_path.exists():
        print_error("未找到微信数据目录，请确认已安装微信")
        return None
    
    # 查找版本目录
    version_dirs = [d for d in base_path.iterdir() if d.is_dir() and d.name[0].isdigit()]
    if not version_dirs:
        print_error("未找到微信版本目录")
        return None
    
    # 使用最新版本
    version_dir = sorted(version_dirs, key=lambda x: x.name, reverse=True)[0]
    print_info(f"微信版本目录: {version_dir.name}")
    
    # 查找用户目录（32位hash）
    user_dirs = [d for d in version_dir.iterdir() if d.is_dir() and len(d.name) == 32]
    
    if not user_dirs:
        print_error("未找到用户数据目录")
        return None
    
    if len(user_dirs) == 1:
        return user_dirs[0]
    
    # 多用户选择
    print_info("发现多个用户目录:")
    for i, d in enumerate(user_dirs):
        msg_path = d / "Message"
        db_count = len(list(msg_path.glob("msg_*.db"))) if msg_path.exists() else 0
        print(f"  [{i+1}] {d.name[:8]}... ({db_count} 个数据库文件)")
    
    while True:
        try:
            choice = int(input(f"\n请选择用户 [1-{len(user_dirs)}]: "))
            if 1 <= choice <= len(user_dirs):
                return user_dirs[choice - 1]
        except ValueError:
            pass
        print_warning("无效选择，请重试")

def find_db_files(wechat_path: Path) -> List[Path]:
    """查找所有数据库文件"""
    msg_path = wechat_path / "Message"
    if not msg_path.exists():
        print_error("未找到Message目录")
        return []
    
    db_files = list(msg_path.glob("msg_*.db"))
    db_files.sort(key=lambda x: x.name)
    
    # 也查找联系人数据库
    contact_db = wechat_path / "Contact" / "wccontact_new2.db"
    if contact_db.exists():
        db_files.insert(0, contact_db)
    
    return db_files

def check_sqlcipher() -> bool:
    """检查sqlcipher是否安装"""
    try:
        result = subprocess.run(["which", "sqlcipher"], capture_output=True, text=True)
        if result.returncode == 0:
            print_success("sqlcipher 已安装")
            return True
    except:
        pass
    
    print_error("sqlcipher 未安装")
    print_info("请运行: brew install sqlcipher")
    return False

def check_sip_status() -> bool:
    """检查SIP状态"""
    try:
        result = subprocess.run(["csrutil", "status"], capture_output=True, text=True)
        if "disabled" in result.stdout.lower():
            print_success("SIP 已关闭")
            return True
        else:
            print_warning("SIP 已开启，可能无法使用lldb提取密钥")
            return False
    except:
        print_warning("无法检查SIP状态")
        return False

def get_key_from_lldb() -> Optional[str]:
    """使用lldb从微信进程获取密钥"""
    print_header("从微信进程提取密钥")
    
    # 检查微信是否运行
    result = subprocess.run(["pgrep", "WeChat"], capture_output=True, text=True)
    if result.returncode != 0:
        print_error("微信未运行，请先启动微信并登录")
        return None
    
    pid = result.stdout.strip().split('\n')[0]
    print_info(f"微信进程ID: {pid}")
    
    print_warning("需要sudo权限来附加到微信进程")
    print_info("即将执行lldb，请按照提示操作...")
    print()
    print(f"{Colors.CYAN}操作步骤:{Colors.END}")
    print("  1. lldb附加后，输入: br set -n sqlite3_key")
    print("  2. 输入: c (继续执行)")
    print("  3. 在微信中切换聊天或刷新触发断点")
    print("  4. 断点触发后，输入: memory read --size 1 --format x --count 32 $rsi")
    print("     (M1/M2芯片使用 $x1 替代 $rsi)")
    print("  5. 复制输出的32字节十六进制密钥")
    print("  6. 输入: quit 退出lldb")
    print()
    
    input("按Enter键开始...")
    
    # 启动lldb
    os.system(f"sudo lldb -p {pid}")
    
    # 手动输入密钥
    print()
    print_info("请粘贴从lldb获取的密钥（32字节十六进制，如 0xe5 0x16 ...）:")
    key_input = input().strip()
    
    if not key_input:
        return None
    
    # 解析密钥
    key = parse_hex_key(key_input)
    if key:
        print_success(f"密钥解析成功: {key[:16]}...")
    return key

def parse_hex_key(hex_string: str) -> Optional[str]:
    """解析十六进制密钥字符串"""
    try:
        # 移除地址前缀和其他非十六进制内容
        parts = hex_string.replace('0x', ' ').replace(',', ' ').split()
        hex_bytes = []
        
        for part in parts:
            part = part.strip()
            if len(part) == 2 and all(c in '0123456789abcdefABCDEF' for c in part):
                hex_bytes.append(part)
        
        if len(hex_bytes) >= 32:
            hex_bytes = hex_bytes[:32]
            return '0x' + ''.join(hex_bytes)
        
        print_error(f"密钥长度不足，需要32字节，当前{len(hex_bytes)}字节")
        return None
    except Exception as e:
        print_error(f"密钥解析失败: {e}")
        return None

def decrypt_database(db_path: Path, key: str, output_dir: Path) -> Optional[Path]:
    """解密单个数据库文件"""
    output_path = output_dir / f"{db_path.stem}_decrypted.db"
    
    try:
        # 使用sqlcipher解密
        commands = f'''
PRAGMA key = "{key}";
PRAGMA cipher_compatibility = 4;
ATTACH DATABASE '{output_path}' AS plaintext KEY '';
SELECT sqlcipher_export('plaintext');
DETACH DATABASE plaintext;
'''
        
        result = subprocess.run(
            ["sqlcipher", str(db_path)],
            input=commands,
            capture_output=True,
            text=True
        )
        
        if output_path.exists() and output_path.stat().st_size > 0:
            return output_path
        else:
            # 尝试另一种方式
            commands2 = f'''
PRAGMA key = "{key}";
PRAGMA cipher_page_size = 4096;
PRAGMA kdf_iter = 64000;
PRAGMA cipher_hmac_algorithm = HMAC_SHA1;
PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA1;
ATTACH DATABASE '{output_path}' AS plaintext KEY '';
SELECT sqlcipher_export('plaintext');
DETACH DATABASE plaintext;
'''
            result = subprocess.run(
                ["sqlcipher", str(db_path)],
                input=commands2,
                capture_output=True,
                text=True
            )
            
            if output_path.exists() and output_path.stat().st_size > 0:
                return output_path
                
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
        
        # 查找消息表 (通常是 MSG 或 Chat_xxx)
        msg_tables = [t for t in tables if 'MSG' in t.upper() or 'CHAT' in t.upper()]
        
        for table in msg_tables:
            try:
                # 获取表结构
                cursor.execute(f"PRAGMA table_info({table})")
                columns = {row[1].lower(): row[1] for row in cursor.fetchall()}
                
                # 常见的消息字段映射
                content_col = columns.get('strcontent') or columns.get('content') or columns.get('message')
                time_col = columns.get('createtime') or columns.get('time') or columns.get('timestamp')
                sender_col = columns.get('strtalker') or columns.get('talker') or columns.get('sender')
                type_col = columns.get('type') or columns.get('msgtype')
                issend_col = columns.get('issend') or columns.get('is_send')
                
                if not content_col:
                    continue
                
                # 构建查询
                select_cols = [content_col]
                if time_col: select_cols.append(time_col)
                if sender_col: select_cols.append(sender_col)
                if type_col: select_cols.append(type_col)
                if issend_col: select_cols.append(issend_col)
                
                query = f"SELECT {', '.join(select_cols)} FROM {table}"
                cursor.execute(query)
                
                for row in cursor.fetchall():
                    msg = {
                        'content': row[0] if row[0] else '',
                        'table': table
                    }
                    
                    idx = 1
                    if time_col:
                        msg['timestamp'] = row[idx]
                        idx += 1
                    if sender_col:
                        msg['sender'] = row[idx]
                        idx += 1
                    if type_col:
                        msg['type'] = row[idx]
                        idx += 1
                    if issend_col:
                        msg['isSelf'] = row[idx] == 1
                        idx += 1
                    
                    if msg['content']:
                        messages.append(msg)
                        
            except Exception as e:
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
        
        # 尝试不同的表结构
        try:
            cursor.execute("SELECT userName, nickName FROM WCContact")
            for row in cursor.fetchall():
                if row[0] and row[1]:
                    contacts[row[0]] = row[1]
        except:
            pass
        
        try:
            cursor.execute("SELECT username, nickname FROM Friend")
            for row in cursor.fetchall():
                if row[0] and row[1]:
                    contacts[row[0]] = row[1]
        except:
            pass
            
        conn.close()
    except:
        pass
    
    return contacts

def export_to_json(messages: List[Dict], contacts: Dict, output_path: Path):
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

def manual_key_input() -> Optional[str]:
    """手动输入密钥"""
    print_header("手动输入密钥")
    print_info("如果你已经有密钥，可以直接输入")
    print_info("密钥格式: 0x + 64个十六进制字符 (32字节)")
    print_info("例如: 0xe516a7b3c4d5e6f7...")
    print()
    
    key = input("请输入密钥 (留空取消): ").strip()
    
    if not key:
        return None
    
    # 验证格式
    if key.startswith('0x') and len(key) == 66:
        try:
            int(key, 16)
            return key
        except:
            pass
    
    # 尝试解析其他格式
    return parse_hex_key(key)

def main():
    print_header("微信聊天记录解密工具 - macOS版")
    
    # 检查环境
    print_info("检查环境...")
    if not check_sqlcipher():
        sys.exit(1)
    
    check_sip_status()
    
    # 获取微信路径
    wechat_path = get_wechat_path()
    if not wechat_path:
        sys.exit(1)
    
    print_success(f"用户目录: {wechat_path.name[:8]}...")
    
    # 查找数据库文件
    db_files = find_db_files(wechat_path)
    if not db_files:
        print_error("未找到数据库文件")
        sys.exit(1)
    
    print_success(f"找到 {len(db_files)} 个数据库文件")
    
    # 获取密钥
    print()
    print_info("选择密钥获取方式:")
    print("  [1] 从微信进程提取 (需要sudo权限)")
    print("  [2] 手动输入密钥")
    print("  [3] 从文件读取密钥")
    
    choice = input("\n请选择 [1-3]: ").strip()
    
    key = None
    if choice == '1':
        key = get_key_from_lldb()
    elif choice == '2':
        key = manual_key_input()
    elif choice == '3':
        key_file = input("请输入密钥文件路径: ").strip()
        if os.path.exists(key_file):
            with open(key_file, 'r') as f:
                key = f.read().strip()
    
    if not key:
        print_error("未获取到有效密钥")
        sys.exit(1)
    
    # 创建输出目录
    output_dir = Path.cwd() / "wechat_decrypted"
    output_dir.mkdir(exist_ok=True)
    
    # 保存密钥
    with open(output_dir / "key.txt", 'w') as f:
        f.write(key)
    print_success(f"密钥已保存到: {output_dir / 'key.txt'}")
    
    # 解密数据库
    print_header("解密数据库")
    
    all_messages = []
    contacts = {}
    decrypted_count = 0
    
    for db_file in db_files:
        print_info(f"解密: {db_file.name}")
        
        decrypted_path = decrypt_database(db_file, key, output_dir)
        
        if decrypted_path:
            print_success(f"  → {decrypted_path.name}")
            decrypted_count += 1
            
            # 提取数据
            if 'contact' in db_file.name.lower():
                contacts.update(extract_contacts(decrypted_path))
            else:
                messages = extract_messages(decrypted_path)
                all_messages.extend(messages)
                print_info(f"    提取 {len(messages)} 条消息")
        else:
            print_warning(f"  解密失败，跳过")
    
    print()
    print_success(f"成功解密 {decrypted_count}/{len(db_files)} 个数据库")
    print_success(f"提取 {len(contacts)} 个联系人")
    print_success(f"提取 {len(all_messages)} 条消息")
    
    # 导出JSON
    if all_messages:
        print_header("导出数据")
        json_path = output_dir / "chat_records.json"
        session_count, msg_count = export_to_json(all_messages, contacts, json_path)
        print_success(f"导出完成: {json_path}")
        print_info(f"  {session_count} 个会话, {msg_count} 条消息")
        print()
        print_info("现在可以在浏览器中打开解析工具，导入生成的JSON文件查看聊天记录")
    
    print()
    print_header("完成")
    print(f"输出目录: {output_dir}")

if __name__ == "__main__":
    main()

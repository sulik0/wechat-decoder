import { useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, Database, Key, Terminal, Lock, Unlock, Code, AlertTriangle, CheckCircle, Copy, BookOpen } from 'lucide-react';

interface TutorialPageProps {
  onBack: () => void;
  onCopyCommand: (command: string, id: string) => void;
  copiedCommand: string | null;
}

export const TutorialPage = ({ onBack, onCopyCommand, copiedCommand }: TutorialPageProps) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'why-encrypt': true,
    'data-location': false,
    'key-extraction': false,
    'decrypt-process': false,
    'script-macos': false,
    'script-windows': false,
  });

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) => (
    <div className="card overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full px-6 py-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="font-semibold flex-1">{title}</span>
        {expandedSections[id] ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="px-6 pb-6 pt-2 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );

  const CodeBlock = ({ code, id, language = 'bash' }: { code: string; id: string; language?: string }) => (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        onClick={() => onCopyCommand(code, id)}
        className="absolute top-2 right-2 p-2 bg-card/80 hover:bg-card rounded-md transition-colors opacity-0 group-hover:opacity-100"
        title="复制代码"
      >
        {copiedCommand === id ? (
          <CheckCircle className="w-4 h-4 text-primary" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            完整教程
          </h1>
          <p className="text-sm text-muted-foreground">深入理解微信数据库解密原理</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {/* 概述 */}
        <div className="card p-6 bg-gradient-to-r from-primary/5 to-accent">
          <h2 className="text-xl font-bold mb-3">概述</h2>
          <p className="text-muted-foreground leading-relaxed">
            微信将聊天记录存储在本地 SQLite 数据库中，但为了保护用户隐私，使用了 <strong>SQLCipher</strong> 进行 AES-256 加密。
            要读取这些数据，我们需要：
          </p>
          <ol className="mt-4 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
              <span>找到微信数据库文件的存储位置</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
              <span>从微信进程内存中提取加密密钥</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
              <span>使用密钥解密数据库文件</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
              <span>解析数据库内容并导出</span>
            </li>
          </ol>
        </div>

        {/* 为什么要加密 */}
        <Section id="why-encrypt" title="为什么微信要加密数据库？" icon={Lock}>
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              微信使用 <strong>SQLCipher</strong> 加密本地数据库，主要出于以下考虑：
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>隐私保护：</strong>防止其他应用或恶意软件直接读取聊天记录</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>数据安全：</strong>即使设备丢失，没有密钥也无法解读内容</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>合规要求：</strong>满足各地区数据保护法规的要求</span>
              </li>
            </ul>
            
            <div className="bg-muted rounded-lg p-4 mt-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                SQLCipher 技术细节
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 加密算法：AES-256-CBC</li>
                <li>• 密钥派生：PBKDF2-HMAC-SHA1（64000 次迭代）</li>
                <li>• 页面大小：4096 字节</li>
                <li>• 每页都有独立的 HMAC 认证</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 数据库位置 */}
        <Section id="data-location" title="微信数据库存储在哪里？" icon={Database}>
          <div className="space-y-6 text-sm">
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                macOS 路径
              </h4>
              <CodeBlock
                id="path-macos"
                code={`~/Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat/<版本号>/<用户哈希>/Message/`}
              />
              <p className="mt-2 text-muted-foreground">
                其中 <code className="bg-muted px-1 rounded">&lt;版本号&gt;</code> 是类似 <code className="bg-muted px-1 rounded">3.8.0.xx</code> 的目录，
                <code className="bg-muted px-1 rounded">&lt;用户哈希&gt;</code> 是 32 位的十六进制字符串。
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Windows 路径
              </h4>
              <CodeBlock
                id="path-windows"
                code={`C:\\Users\\<用户名>\\Documents\\WeChat Files\\<微信号>\\Msg\\`}
              />
            </div>

            <div className="bg-accent/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">主要数据库文件</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="bg-muted px-1 rounded">MSG0.db ~ MSGx.db</code> - 聊天消息（按时间分片）</li>
                <li><code className="bg-muted px-1 rounded">MicroMsg.db</code> - 联系人、群组信息</li>
                <li><code className="bg-muted px-1 rounded">MediaMSG0.db</code> - 媒体文件索引</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 密钥提取原理 */}
        <Section id="key-extraction" title="如何提取加密密钥？" icon={Key}>
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              微信的加密密钥存储在进程内存中，我们需要通过调试器附加到微信进程来提取它。
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-400">为什么需要 sudo 权限？</h4>
                  <p className="text-amber-700 dark:text-amber-500 mt-1">
                    附加到其他进程需要管理员权限。macOS 的 SIP（系统完整性保护）会阻止调试系统进程，
                    但微信不是系统进程，通常不需要关闭 SIP。
                  </p>
                </div>
              </div>
            </div>

            <h4 className="font-medium mt-6">macOS 使用 lldb 提取</h4>
            <p className="text-muted-foreground">
              <code className="bg-muted px-1 rounded">lldb</code> 是 macOS 自带的调试器。我们通过设置断点在 
              <code className="bg-muted px-1 rounded">sqlite3_key</code> 函数上，当微信调用这个函数打开加密数据库时，
              就可以从寄存器中读取密钥。
            </p>

            <CodeBlock
              id="lldb-commands"
              language="bash"
              code={`# 1. 附加到微信进程
sudo lldb -p $(pgrep WeChat)

# 2. 设置断点（sqlite3_key 是 SQLCipher 的密钥设置函数）
(lldb) br set -n sqlite3_key

# 3. 继续运行
(lldb) c

# 4. 在微信中切换聊天，触发断点后读取密钥
# Intel Mac 使用 $rsi，Apple Silicon 使用 $x1
(lldb) memory read --size 1 --format x --count 32 $rsi

# 5. 输出类似：0xe5 0x16 0xa7 0xb3 ... (32个字节)
# 这就是加密密钥`}
            />

            <h4 className="font-medium mt-6">Windows 使用 pymem 提取</h4>
            <p className="text-muted-foreground">
              Windows 上我们使用 Python 的 <code className="bg-muted px-1 rounded">pymem</code> 库来读取进程内存。
              密钥通常存储在特定的内存模式附近。
            </p>

            <CodeBlock
              id="pymem-concept"
              language="python"
              code={`import pymem

# 打开微信进程
pm = pymem.Pymem("WeChat.exe")

# 通过内存模式搜索定位密钥
# 密钥通常在特定字符串附近
# 具体实现见完整脚本`}
            />
          </div>
        </Section>

        {/* 解密过程 */}
        <Section id="decrypt-process" title="数据库解密过程" icon={Unlock}>
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              获取密钥后，我们使用 <code className="bg-muted px-1 rounded">sqlcipher</code> 命令行工具将加密数据库导出为未加密版本。
            </p>

            <h4 className="font-medium">解密命令详解</h4>
            <CodeBlock
              id="decrypt-sql"
              language="sql"
              code={`-- 设置密钥（0x开头的十六进制字符串）
PRAGMA key = "0xe516a7b3c4d5e6f7...";

-- 设置 SQLCipher 版本兼容性（微信使用 v4）
PRAGMA cipher_compatibility = 4;

-- 附加一个新的空白数据库（不加密）
ATTACH DATABASE 'decrypted.db' AS plaintext KEY '';

-- 将所有数据导出到新数据库
SELECT sqlcipher_export('plaintext');

-- 分离数据库
DETACH DATABASE plaintext;`}
            />

            <div className="bg-muted rounded-lg p-4 mt-4">
              <h4 className="font-medium mb-2">参数说明</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <code className="text-foreground">PRAGMA key</code> - 设置解密密钥，必须与加密时使用的密钥完全一致
                </li>
                <li>
                  <code className="text-foreground">cipher_compatibility = 4</code> - 微信使用 SQLCipher 4.x 版本的加密参数
                </li>
                <li>
                  <code className="text-foreground">KEY ''</code> - 空密钥表示目标数据库不加密
                </li>
                <li>
                  <code className="text-foreground">sqlcipher_export</code> - SQLCipher 提供的导出函数，会复制所有表和数据
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* macOS 完整脚本 */}
        <Section id="script-macos" title="macOS 解密脚本详解" icon={Code}>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              以下是 <code className="bg-muted px-1 rounded">scripts/decrypt_macos.py</code> 的核心逻辑解析：
            </p>

            <h4 className="font-medium mt-4">1. 定位微信数据目录</h4>
            <CodeBlock
              id="macos-script-1"
              language="python"
              code={`def get_wechat_path():
    """获取微信数据目录"""
    # macOS 上微信数据存储在 Containers 沙盒中
    base_path = Path.home() / "Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat"
    
    # 查找版本目录（数字开头的目录）
    version_dirs = [d for d in base_path.iterdir() if d.is_dir() and d.name[0].isdigit()]
    version_dir = sorted(version_dirs, key=lambda x: x.name, reverse=True)[0]  # 使用最新版本
    
    # 查找用户目录（32位哈希值）
    user_dirs = [d for d in version_dir.iterdir() if d.is_dir() and len(d.name) == 32]
    return user_dirs[0]  # 如果多用户，让用户选择`}
            />

            <h4 className="font-medium mt-4">2. 使用 lldb 提取密钥</h4>
            <CodeBlock
              id="macos-script-2"
              language="python"
              code={`def get_key_from_lldb():
    """使用 lldb 从微信进程获取密钥"""
    # 检查微信是否运行
    result = subprocess.run(["pgrep", "WeChat"], capture_output=True, text=True)
    if result.returncode != 0:
        print("微信未运行，请先启动微信并登录")
        return None
    
    pid = result.stdout.strip().split('\\n')[0]
    
    # 启动 lldb 附加到微信进程
    # 用户需要手动输入命令并复制密钥
    os.system(f"sudo lldb -p {pid}")
    
    # 获取用户输入的密钥
    key_input = input("请粘贴从 lldb 获取的密钥: ")
    return parse_hex_key(key_input)`}
            />

            <h4 className="font-medium mt-4">3. 解密数据库</h4>
            <CodeBlock
              id="macos-script-3"
              language="python"
              code={`def decrypt_database(db_path, key, output_dir):
    """使用 sqlcipher 解密单个数据库文件"""
    output_path = output_dir / f"{db_path.stem}_decrypted.db"
    
    # SQLCipher 命令
    commands = f'''
PRAGMA key = "{key}";
PRAGMA cipher_compatibility = 4;
ATTACH DATABASE '{output_path}' AS plaintext KEY '';
SELECT sqlcipher_export('plaintext');
DETACH DATABASE plaintext;
'''
    
    # 执行解密
    result = subprocess.run(
        ["sqlcipher", str(db_path)],
        input=commands,
        capture_output=True,
        text=True
    )
    
    return output_path if output_path.exists() else None`}
            />

            <h4 className="font-medium mt-4">4. 提取消息并导出 JSON</h4>
            <CodeBlock
              id="macos-script-4"
              language="python"
              code={`def extract_messages(db_path):
    """从解密的数据库中提取消息"""
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # 查找消息表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    
    messages = []
    for table in tables:
        if 'MSG' in table.upper():
            # 提取消息内容、时间、发送者等
            cursor.execute(f"SELECT strContent, createTime, strTalker, type, isSend FROM {table}")
            for row in cursor.fetchall():
                messages.append({
                    'content': row[0],
                    'timestamp': row[1] * 1000,  # 转换为毫秒
                    'sender': row[2],
                    'type': row[3],
                    'isSelf': row[4] == 1
                })
    
    conn.close()
    return messages`}
            />
          </div>
        </Section>

        {/* Windows 完整脚本 */}
        <Section id="script-windows" title="Windows 解密脚本详解" icon={Code}>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              以下是 <code className="bg-muted px-1 rounded">scripts/decrypt_windows.py</code> 的核心逻辑解析：
            </p>

            <h4 className="font-medium mt-4">1. 从内存中提取密钥</h4>
            <CodeBlock
              id="windows-script-1"
              language="python"
              code={`import pymem
from Crypto.Cipher import AES

def get_key_from_memory():
    """从微信进程内存中提取密钥"""
    try:
        pm = pymem.Pymem("WeChat.exe")
    except:
        print("请先启动微信")
        return None
    
    # 微信在内存中存储密钥的特征
    # 通过搜索特定模式定位密钥位置
    # 密钥长度为 32 字节
    
    # 获取 WeChatWin.dll 模块基址
    module = pymem.process.module_from_name(pm.process_handle, "WeChatWin.dll")
    
    # 在模块内存中搜索密钥
    # 具体偏移量可能因版本而异
    key_offset = find_key_pattern(pm, module.lpBaseOfDll)
    
    if key_offset:
        key = pm.read_bytes(key_offset, 32)
        return key.hex()
    
    return None`}
            />

            <h4 className="font-medium mt-4">2. 定位数据库文件</h4>
            <CodeBlock
              id="windows-script-2"
              language="python"
              code={`def find_wechat_db():
    """查找微信数据库路径"""
    # 从注册表或默认路径获取
    default_path = Path.home() / "Documents/WeChat Files"
    
    # 查找用户目录
    for user_dir in default_path.iterdir():
        if user_dir.is_dir():
            msg_path = user_dir / "Msg"
            if msg_path.exists():
                return msg_path
    
    return None`}
            />

            <h4 className="font-medium mt-4">3. 使用 pycryptodome 解密</h4>
            <CodeBlock
              id="windows-script-3"
              language="python"
              code={`from Crypto.Cipher import AES
import hashlib

def decrypt_db_page(page_data, key, page_no):
    """解密单个数据库页"""
    # SQLCipher 使用 PBKDF2 派生页密钥
    salt = page_data[:16]  # 前 16 字节是盐值
    
    # 派生密钥
    derived_key = hashlib.pbkdf2_hmac(
        'sha1', 
        key, 
        salt, 
        64000,  # 迭代次数
        dklen=32
    )
    
    # AES-256-CBC 解密
    iv = page_data[16:32]
    cipher = AES.new(derived_key, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(page_data[32:])
    
    return decrypted`}
            />

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-blue-800 dark:text-blue-400 mb-2">Windows 脚本注意事项</h4>
              <ul className="space-y-1 text-blue-700 dark:text-blue-500">
                <li>• 需要以管理员身份运行</li>
                <li>• 微信版本更新可能导致内存偏移变化</li>
                <li>• 某些安全软件可能阻止内存读取</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 常见问题 */}
        <div className="card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            常见问题
          </h3>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium">Q: 为什么解密后的数据库是空的？</h4>
              <p className="text-muted-foreground mt-1">
                可能是密钥不正确或 SQLCipher 版本参数不匹配。确保使用 <code className="bg-muted px-1 rounded">cipher_compatibility = 4</code>。
              </p>
            </div>
            <div>
              <h4 className="font-medium">Q: macOS 上 lldb 报权限错误？</h4>
              <p className="text-muted-foreground mt-1">
                确保使用 <code className="bg-muted px-1 rounded">sudo</code> 运行。如果仍有问题，可能需要在恢复模式下关闭 SIP。
              </p>
            </div>
            <div>
              <h4 className="font-medium">Q: Windows 上找不到密钥？</h4>
              <p className="text-muted-foreground mt-1">
                微信版本更新后内存布局可能变化。可以尝试更新脚本或使用其他工具。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

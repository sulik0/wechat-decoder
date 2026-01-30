# 微信聊天记录解密工具

## 功能说明

这是一个用于解密微信本地聊天数据库的工具，支持 macOS 和 Windows 系统。

## 使用前准备

### macOS

1. **安装 sqlcipher**
   ```bash
   brew install sqlcipher
   ```

2. **关闭 SIP（可选，用于自动提取密钥）**
   - 重启 Mac，按住 Command + R 进入恢复模式
   - 打开终端，输入 `csrutil disable`
   - 重启电脑

### Windows

1. **安装 Python 依赖**
   ```bash
   pip install pymem pycryptodome
   ```

2. **以管理员身份运行**

## 使用方法

### macOS

```bash
cd scripts
python3 decrypt_macos.py
```

按照提示操作：
1. 选择密钥获取方式（推荐从微信进程提取）
2. 如果使用 lldb 提取：
   - 输入 `br set -n sqlite3_key`
   - 输入 `c` 继续
   - 在微信中切换聊天触发断点
   - 输入 `memory read --size 1 --format x --count 32 $rsi`（Intel）或 `$x1`（Apple Silicon）
   - 复制输出的密钥
3. 等待解密完成

### Windows

以管理员身份运行：
```bash
cd scripts
python decrypt_windows.py
```

## 输出文件

解密后的文件保存在 `wechat_decrypted` 目录：
- `*_decrypted.db` - 解密后的数据库文件
- `chat_records.json` - 导出的聊天记录（可导入到 Web 查看器）
- `key.txt` - 保存的密钥（下次可直接使用）

## Web 查看器

解密完成后，可以：
1. 启动 Web 查看器：`npm run dev`
2. 在浏览器中打开
3. 上传 `chat_records.json` 文件查看聊天记录

## 常见问题

### macOS

**Q: lldb 无法附加到微信进程**
A: 需要关闭 SIP 或授予终端完全磁盘访问权限

**Q: 密钥提取失败**
A: 确保微信已登录，尝试在微信中切换聊天或刷新

### Windows

**Q: 读取内存失败**
A: 确保以管理员身份运行，且微信版本与脚本中的偏移量匹配

**Q: 解密后数据库无法打开**
A: 可能是微信版本更新导致加密方式变化，请反馈问题

## 免责声明

此工具仅供个人备份和学习使用，请勿用于非法用途。使用者需自行承担相关风险。

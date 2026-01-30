# WeChat Decoder (微信聊天记录解析器)

基于 React + Vite 开发的微信本地聊天记录解析工具，旨在提供一个安全、私密且高仿真的聊天记录查看环境。

## ✨ 核心特性

- **高仿真 UI**: 深度还原微信聊天界面，支持绿色气泡、系统消息、时间分割线等。
- **媒体还原**: 支持 `.dat` 加密图片自动解密并在线预览。
- **多样化解析**: 支持解析由解密脚本导出的 JSON、CSV 以及纯文本格式。
- **本地化处理**: 所有解析逻辑均在浏览器端完成，无需上传数据，保护隐私安全。
- **一键导出**: 
  - 支持导出为标准 JSON 格式。
  - 支持导出为**高仿真 HTML** 文件，方便永久保存与离线查看。

## 🛠️ 技术栈

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Icons**: Lucide React
- **Build Tool**: Vite

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone git@github.com:sulik0/wechat-decoder.git
cd wechat-decoder
```

### 2. 安装依赖
```bash
npm install
```

### 3. 启动开发服务器
```bash
npm run dev
```
默认访问地址：`http://localhost:3000`

## 🔐 数据库解密指南

查看项目内置的 **"数据库解密指南"** 按钮，获取 macOS 和 Windows 平台的详细解密步骤。

### macOS 简述
1. 安装 `sqlcipher`: `brew install sqlcipher`
2. 使用 `lldb` 附加微信进程获取密钥。
3. 运行 `scripts/decrypt_macos.py` 进行解密。

### Windows 简述
1. 安装依赖: `pip install pymem pycryptodome`
2. 以管理员身份运行 `scripts/decrypt_windows.py`。

## 📂 导入说明
- 解密后，将生成的 `chat_records.json` 拖入网页。
- 如需查看图片，请将对应的 `.dat` 文件一并拖入。

## ⚖️ 免责声明
本工具仅用于学习交流及个人数据备份。请务必在遵守当地法律法规的前提下使用，严禁用于非法用途。

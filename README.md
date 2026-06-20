# Claude Pilot

基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) 构建的桌面 AI 助手（Electron + React）。内置多个专家角色（Office 办公助手、金融顾问），通过本地 MCP 工具实现文档处理、格式转换、数据分析等能力。

## 功能特性

- **Office 办公助手**：读取、编辑、转换 PDF / Word / Excel / PowerPoint，自动化日常办公流程
- **金融顾问**：基于 Yahoo Finance 实时数据分析美股、日股，提供报价、基本面、历史价格、市场概览、选股器等（数据均来自实时调用，不使用估算或记忆数据）
- **文档格式转换**：集成 LibreOffice（Office 文档）与 Calibre（电子书格式）实现多格式互转
- **Python / TypeScript 代码执行**：内置 Python 3.13 嵌入式运行时（含 pandas、openpyxl、xlwings 等）与 TypeScript 沙箱执行工具
- **Skills 系统**：支持从本地或远程市场（GitHub 仓库）安装可复用的技能包
- **多语言界面**：支持中文 / 英文 / 日文，明暗主题切换

## 环境要求

- **操作系统**：Windows（当前唯一经过验证支持的平台；项目内嵌的 Python、LibreOffice、Calibre 均为 Windows 版本，且依赖 `pywin32`/PowerShell）
- **Node.js**：`>= 22.12.0`（Electron 42 的最低要求）
- **Claude 账号或 API Key**：用于调用 Claude 模型（见下方「认证配置」）

## 安装步骤

### 1. 克隆并安装依赖

```bash
git clone <repo-url>
cd claude-pilot
npm install
```

`npm install` 会自动执行 `postinstall`，依次运行：

| 脚本 | 作用 |
|---|---|
| `scripts/setup-python-env.js` | 下载并配置 Python 3.13 嵌入式运行时，安装 `python-requirements.txt` 中的依赖 |
| `scripts/setup-calibre.js` | 从本地压缩包解压 Calibre Portable（电子书转换） |
| `scripts/setup-libreoffice.js` | 从本地压缩包解压 LibreOffice Portable（文档转换） |

### 2. 准备 Calibre / LibreOffice 离线压缩包（必须手动放置）

为避免在线下载不稳定，Calibre 和 LibreOffice 不再在安装时联网下载，而是从本地压缩包解压。这两个压缩包体积较大（约 250MB / 320MB），**未纳入 Git 版本控制**，每台机器/每次克隆都需要手动放置：

```
packages/calibrePortable/CalibrePortable.zip
packages/libreofficePortable/LibreOfficePortable.zip
```

要求：
- 压缩包解压后顶层目录名必须分别为 `CalibrePortable` 和 `LibreOfficePortable`（即压缩包内第一层就是该文件夹）
- 来源可以是官方 Calibre Portable / LibreOffice Portable 发行包解压后重新打包的 zip

放好压缩包后，可单独重跑对应脚本：

```bash
npm run setup:calibre
npm run setup:libreoffice
```

若压缩包缺失，脚本会打印明确的错误（指出期望路径）并跳过该工具，不会让 `npm install` 失败，也不会用估算/降级方式假装安装成功——对应功能在应用内会显示为「未安装」。

## 认证配置

应用按以下优先级查找 Claude 凭证（见 [src/core/auth/auth-manager.ts](src/core/auth/auth-manager.ts)）：

1. **环境变量** `ANTHROPIC_API_KEY`
2. **`~/.claude/settings.json`** 中的 `env.ANTHROPIC_API_KEY`（可选 `env.ANTHROPIC_BASE_URL` 用于自定义代理/中转地址）
   ```json
   {
     "env": {
       "ANTHROPIC_API_KEY": "sk-ant-...",
       "ANTHROPIC_BASE_URL": "https://your-proxy.example.com"
     }
   }
   ```
3. **应用内 OAuth 登录**：在应用「设置」面板中点击「Login with Claude Account（Pro/Max/Team）」或「Login with Console Account（API Billing）」，凭证会自动保存到 `~/.claude/.credentials.json` 并在过期时自动刷新

无需手动配置即可使用方式 3；方式 1、2 适合无头环境或已有 Claude Code 配置的用户。

### 应用设置

应用自身的设置（默认角色、工作目录、主题、语言）保存在 `~/.claude-pilot/settings.json`，首次启动时自动创建。

## 开发

```bash
npm run dev:electron   # 启动 Vite + Electron 开发环境（带热重载）
npm run lint             # ESLint 检查
npm run test             # 运行 Vitest 测试
```

## 打包发布

```bash
npm run build
```

依次执行 `tsc`（类型检查）→ `vite build`（构建产物）→ `electron-builder`（打包安装包），输出到 `release/`（Windows 为 NSIS 安装包）。本地直接运行**不会**发布到 GitHub，只在本机生成安装包。

打包时会将 Python 嵌入运行时、`src/core/agent-defs`、`src/core/custom-skills` 一并打入安装包；LibreOffice Portable 会从 `packages/libreofficePortable/LibreOfficePortable` 打包进资源目录，因此**打包前需先完成上面的安装步骤**确保该目录已解压存在。

### 发布到 GitHub Release

推送形如 `v0.1.0` 的 tag（需与 `package.json` 的 `version` 一致）会触发 [.github/workflows/release.yml](.github/workflows/release.yml)：在 `windows-latest` 上 checkout（含 Git LFS，用于获取打包进仓库的 Calibre/LibreOffice 离线压缩包）→ `npm ci` → lint → test → `npm run build -- --publish always`。

`--publish always` 由 `electron-builder` 读取，结合 `package.json` 中的 `build.publish`（`provider: github`）自动创建/更新一个**草稿（draft）** Release 并上传安装包，不会自动公开发布，需要到 GitHub 仓库的 Releases 页面手动确认发布。也可以在 Actions 页面手动触发（`workflow_dispatch`），无需打 tag。

## 项目结构

```
src/
├── core/                 # 与 UI 无关的核心逻辑
│   ├── agents/           # Agent 加载、MCP server 注册
│   ├── agent-defs/       # 内置角色定义（office-assist、financial-advisor）
│   ├── auth/             # 认证（API Key / OAuth）
│   ├── settings/         # 应用设置管理
│   ├── skills/           # Skills 市场与管理
│   └── tools/            # MCP 工具服务器（docx / xlsx / pptx / pdf / image / convert / finance / python / typescript）
├── gui/
│   ├── main/              # Electron 主进程
│   ├── preload/           # 安全 IPC 桥接
│   └── renderer/          # React 界面
└── shared/                # 主进程与渲染进程共享的类型/工具
```

## License

Apache-2.0

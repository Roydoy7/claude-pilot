# Claude Pilot

基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) 构建的桌面 AI 助手（Electron + React）。内置多个专家角色（Office 办公助手、金融顾问），通过本地 MCP 工具实现文档处理、格式转换、数据分析等能力，并支持多智能体协作（Subagent）。

## 功能特性

- **Office 办公助手**：读取、编辑、转换 PDF / Word / Excel / PowerPoint，自动化日常办公流程；内置独立子智能体 `office-quality-reviewer` 对输出物进行质量审核
- **金融顾问**：基于 Yahoo Finance 实时数据分析美股、日股，提供报价、基本面、历史价格、市场概览、选股器等（数据均来自实时调用，不使用估算或记忆数据）
- **多模型支持**：支持选择 Claude Fable 5、Opus 4.8、Opus 4.7、Opus 4.6、Sonnet 4.6、Haiku 4.5；支持 Effort Level 调节（`low` / `medium` / `high` / `xhigh` / `max`）
- **多会话管理**：支持同时运行多个独立会话，会话切换时自动隔离状态
- **子智能体（Subagent）**：Agent 可在运行时派生子智能体处理专项任务，UI 实时展示子智能体活动状态与心跳
- **浏览器自动化**：内置浏览器工具（`mcp__browser__*`），支持网页导航、截图、点击、输入、多标签管理、JS 执行等
- **文档格式转换**：集成 LibreOffice（Office 文档）与 Calibre（电子书格式）实现多格式互转
- **Python / TypeScript 代码执行**：内置 Python 3.13 嵌入式运行时（含 pandas、openpyxl、xlwings 等）与 TypeScript 沙箱执行工具
- **Skills 系统**：支持从本地或远程市场（GitHub 仓库）安装可复用的技能包
- **多语言界面**：支持中文 / 英文 / 日文，明暗主题切换

## 环境要求

- **操作系统**：Windows（当前唯一经过验证支持的平台；项目内嵌的 Python、LibreOffice、Calibre 均为 Windows 版本，且依赖 `pywin32`/PowerShell）
- **Node.js**：`>= 22.12.0`（Electron 42 的最低要求）
- **版本**：当前为 `v0.1.5`
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
│   ├── agents/           # Agent 加载、MCP server 注册、子智能体工厂
│   ├── agent-defs/       # 内置角色定义（每个子目录为一个 agent）
│   │   ├── office-assist/
│   │   └── financial-advisor/
│   ├── auth/             # 认证（API Key / OAuth）
│   ├── config/           # 工作区管理
│   ├── context/          # 系统上下文与 reminders 注入
│   ├── providers/        # 模型列表管理（支持的模型、thinking 配置、effort level）
│   ├── services/         # Claude Agent Service（消息流、工具审批、会话隔离）
│   ├── sessions/         # 多会话管理与 transcript 持久化
│   ├── settings/         # 应用设置管理
│   ├── skills/           # Skills 市场与管理
│   ├── storage/          # 通用本地存储
│   ├── templates/        # 提示词模板管理
│   └── tools/            # 共享 MCP 工具服务器（docx / xlsx / pptx / pdf / image / convert / python / typescript / browser）
├── gui/
│   ├── main/              # Electron 主进程
│   ├── preload/           # 安全 IPC 桥接
│   └── renderer/          # React 界面
└── shared/                # 主进程与渲染进程共享的类型/工具
```

## Agent 定义

每个 agent 是 `src/core/agent-defs/<id>/` 下的一个目录，包含以下文件：

| 文件/目录 | 说明 |
|---|---|
| `description.md` | 第一行为显示名称，其余行为描述 |
| `system-prompt.md` | Agent 的完整 system prompt |
| `tools.md` | 声明 agent 可用的工具（见下方格式说明） |
| `prompts.md` | 每行一条示例提示词，显示在输入框下方 |
| `skills/<name>/` | 标记目录，指定 agent 默认加载的内置 skills |
| `tools/<name>.ts\|.py` | Agent 私有的本地工具脚本（可选） |
| `agents/<name>.md` | 该 agent 可派生的子智能体定义（可选，见下方） |

新增一个 `agent-defs/<id>/` 目录即可创建新 agent，无需修改代码中的 agent 列表。

### 子智能体（Subagent）

在 agent 目录的 `agents/` 子目录下放置 `.md` 文件，即可为该 agent 定义可派生的子智能体。文件使用 frontmatter 声明元数据：

```markdown
---
name: office-quality-reviewer
description: 对 Office 交付物进行独立质量审核
tools: Read, Glob, mcp__docx__docx, mcp__pdf__process
model: inherit
maxTurns: 12
skills:
  - office-quality
---

子智能体的 system prompt...
```

- `model: inherit` 表示继承主 agent 的模型选择
- 子智能体在运行时由主 agent 通过 SDK 的 `TaskCreate` 工具派生
- UI 会实时展示子智能体的活动状态与心跳

### tools.md 格式

`tools.md` 使用四个区块声明工具：

```markdown
#TOOLS
SDK_TOOLS          # 展开为全部 Claude SDK 内置工具（Read/Write/Edit/Glob/Grep/Bash/WebFetch/WebSearch/TaskCreate…/Skill）

#SAFE-TOOLS
SAFE_TOOLS         # 展开为只读 SDK 工具（不含 Write/Edit/Bash）

#MCP-TOOLS
mcp__convert__convert
mcp__browser__navigate

#SAFE-MCP-TOOLS
mcp__convert__convert
mcp__browser__navigate
```

- `#TOOLS` / `#SAFE-TOOLS`：SDK 内置工具列表；`SDK_TOOLS` 和 `SAFE_TOOLS` 是宏，会自动展开
- `#MCP-TOOLS`：agent 需要的 MCP 工具（格式 `mcp__<server>__<tool>`），loader 根据 server 名在 `mcp-server-registry.ts` 中查找对应服务器
- `#SAFE-MCP-TOOLS`：无需用户确认即可自动执行的 MCP 工具子集

### 本地工具（agent-defs/\<id\>/tools/）

在 agent 目录的 `tools/` 子目录下放置 `.ts` 或 `.py` 脚本，即可为该 agent 添加私有工具，无需修改 `tools.md`。每个脚本文件对应一个工具，工具名等于文件名（不含扩展名）；以 `_` 开头的文件视为共享辅助模块，不注册为工具。

脚本文件头部使用 frontmatter 注释声明元数据：

```typescript
// ---
// description: 工具的描述，用于 Claude 理解其用途
// safe: true          # 是否无需确认自动执行（可选，默认 false）
// timeout: 30000      # 超时毫秒数（可选）
// args:
//   symbol: string (required) - 股票代码
//   limit: number (optional, default 10) - 返回条数
// ---
```

本地工具自动注册为 `mcp__local__<name>`，不出现在 `tools.md` 中。`financial-advisor` 的所有金融数据工具均通过此机制实现。

## License

Apache-2.0

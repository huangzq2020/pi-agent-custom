# pi-agent 文件与目录分析

> 分析路径：`D:\code\pi-agent`  
> 分析基线：提交 `ffcdf001c`，仓库包版本 `0.84.2`，分析日期 `2026-08-24`  
> 文件规模：约 1,333 个 Git 跟踪文件，10 个一级功能包。

## 1. 范围和阅读方式

本文按目录层级说明仓库自有文件。以下机器生成内容只说明目录职责，不逐文件展开：

- `.git/`：Git 对象、引用、索引和工作树元数据。
- `node_modules/` 及各包内的 `node_modules/`：npm 安装的第三方依赖和 workspace 链接。
- `dist/`：TypeScript 编译后的 JavaScript、声明文件和 source map；源文件的镜像产物。
- `package-lock.json`、`npm-shrinkwrap.json`：依赖解析快照，按整体说明，不逐条解析依赖。
- 二进制文件，如 `.node`、`.png`、`.wasm`：说明其运行用途，不解析内部格式。
- 大量测试文件按被测模块或文件名模式归类；文件名通常直接对应行为或回归场景。

文中“入口”指其他包或命令最先导入的文件；“桶文件”指只负责集中转出的 `index.ts`。

## 2. 整体架构

```text
基础层
├─ telemetry       通用遥测协议、内存实现、类型化 schema
├─ protocol        远程会话的 CBOR 消息、校验和分帧
└─ tui             终端渲染、布局、输入和控件

模型与执行层
├─ ai              多供应商模型、鉴权、流式协议和模型目录
└─ agent           Agent 循环、工具调用、状态、会话 harness
   └─ sqlite-node  agent 会话的 SQLite 持久化与搜索后端

远程访问层
├─ client          protocol 的客户端状态机和会话租约
└─ server          protocol 的服务端状态机和 Unix socket 监听器

产品层
├─ coding-agent    pi CLI、交互界面、工具、扩展、会话和 SDK
└─ evals           基于真实模型的端到端行为评估
```

主要内部依赖关系：

- `ai -> telemetry`
- `agent -> ai + telemetry`
- `sqlite-node -> agent + ai`
- `client -> protocol`
- `server -> protocol + ai`
- `coding-agent -> client + protocol + agent + ai + tui`
- `evals -> coding-agent + ai`

这说明修改的影响范围通常由底向上扩散。例如更改 `protocol/schemas.ts`，至少要核对 `client`、`server` 和 `coding-agent`；更改 `ai` 消息类型，还要核对 `agent`、`server`、`coding-agent` 和 `evals`。

## 3. 根目录 `D:\code\pi-agent`

### 3.1 根目录文件夹

| 路径 | 用途 | 主要内容 |
|---|---|---|
| `.git/` | 本地 Git 数据库 | 对象、分支引用、索引、hooks 元数据；不是项目源码。 |
| `.github/` | GitHub 仓库自动化 | Issue 模板、贡献者准入名单、CI、发布、安全审计和议题分流工作流。 |
| `.husky/` | 本地 Git hook | 提交前阻止意外 lockfile 变更，并运行格式、lint、类型检查。 |
| `.pi/` | 本仓库开发时使用的 Pi 资源 | 仓库专用扩展、提示模板、技能以及临时 Git/npm 隔离目录占位。 |
| `node_modules/` | 根 workspace 依赖 | npm 安装生成，不应手工编辑。 |
| `packages/` | 全部产品包和库 | 10 个一级功能包，以及 `session-backends/sqlite-node` 子包。 |
| `scripts/` | 仓库级维护工具 | 构建、发布、模型目录、依赖校验、性能分析和会话统计脚本。 |

### 3.2 根目录文件

| 文件 | 用途 |
|---|---|
| `.gitattributes` | 统一文本换行：默认 LF，Windows 脚本使用 CRLF；标记图片、字体、压缩包等为二进制。 |
| `.gitignore` | 忽略依赖、构建产物、模型生成缓存、环境变量、编辑器配置、覆盖率和本地会话分析产物。 |
| `.npmrc` | 强制直接依赖精确版本，并设置 npm 包最短发布时间门槛。 |
| `AGENTS.md` | 仓库开发规则：代码质量、命令、依赖安全、Git、测试、变更日志和发布流程。 |
| `biome.json` | Biome 格式化与 lint 配置；限定检查目录和例外规则。 |
| `CONTRIBUTING.md` | 外部贡献准入、Issue/PR 质量要求和维护策略。 |
| `gcm-diagnose.log` | Git Credential Manager 诊断日志；属于排障资料，不参与构建或运行。 |
| `LICENSE` | MIT 许可证。 |
| `package.json` | npm workspace 根清单；定义构建顺序、检查、测试、模型生成、版本和发布命令。 |
| `package-lock.json` | 整个 monorepo 的精确依赖图，是依赖供应链的基准文件。 |
| `pi_download.ps1` | 本地辅助脚本：下载指定 Pi 发布源码、校验 SHA-256，并复制生成的模型数据到 `packages/ai/src/providers/data/`。它不是标准发布流程入口。 |
| `pi-test.sh` | Unix 下从 TypeScript 源码直接启动 `pi`；`--no-env` 可清除供应商凭据。 |
| `pi-test.ps1` | Windows PowerShell 版源码启动器，负责参数转发和可选凭据清理。 |
| `pi-test.bat` | Windows CMD 包装器，调用 `pi-test.ps1`。 |
| `README.md` | 仓库总览、包索引、开发命令、权限模型、发布构建和供应链策略。 |
| `SECURITY.md` | 安全边界和漏洞报告范围；明确 Pi 本身不是沙箱。 |
| `test.sh` | 隔离用户目录、凭据、Git/npm 配置后运行非 e2e 测试，防止本机环境污染测试。 |
| `tsconfig.base.json` | 所有包共享的 TypeScript 严格模式、Node/Bun 目标和仅可擦除语法设置。 |
| `tsconfig.json` | monorepo 总类型检查配置；把内部包名映射到源码，覆盖源码、测试和示例。 |
| `tui-plan.md` | Alternate Screen 约束布局系统的设计和实施交接文档，包括布局、滚动、命中测试、图片、覆盖层与测试计划。 |
| `vitest.base.ts` | Vitest 公共配置；把已发布包名映射到 workspace 源码，保证测试运行当前代码。 |

## 4. `.github/`

### 4.1 `.github/ISSUE_TEMPLATE/`

| 文件 | 用途 |
|---|---|
| `bug.yml` | Bug 报告表单，要求简短复现、期望行为和环境信息。 |
| `contribution.yml` | 新功能或修改提案表单，是新贡献者提交 PR 前的讨论入口。 |
| `package-report.yml` | 报告 pi.dev 所列第三方 Pi 包的问题。 |
| `config.yml` | 禁止空白 Issue，并把一般问题引导到 Discord。 |

### 4.2 `.github/workflows/`

| 文件 | 用途 |
|---|---|
| `approve-contributor.yml` | 解析维护者的 `lgtm`/`lgtmi` 评论，更新贡献者许可。 |
| `build-binaries.yml` | 标签发布时构建 Node/Bun 发行物、发布 npm、验证并创建 GitHub Release。 |
| `ci.yml` | 主 CI：安装依赖、构建、检查并执行测试。 |
| `issue-analysis.yml` | 在授权触发后，让 Pi 自动分析 Issue，并上传可复现会话。 |
| `issue-gate.yml` | 新 Issue 准入门：根据贡献者许可和机器人白名单决定是否自动关闭。 |
| `issue-triage-labels.yml` | 维护 `untriaged`、`no-action`、`last-read`、`to-discuss`、`inprogress` 等分流标签。 |
| `npm-audit.yml` | 定时检查生产依赖漏洞和 npm registry 签名。 |
| `pr-gate.yml` | 新 PR 准入门，未获 `pr` 权限的贡献者会被自动处理。 |
| `publish-model-catalog.yml` | 从 `packages/ai` 生成并校验模型目录，按条件发布到 R2。 |
| `remove-inprogress-on-close.yml` | Issue 关闭后移除 `inprogress` 标签。 |

`APPROVED_CONTRIBUTORS` 保存已获许可的 GitHub 用户及 `issue`/`pr` 权限，是上述准入工作流的数据源。

## 5. `.husky/`

`pre-commit` 是唯一 hook：先运行 `scripts/check-lockfile-commit.mjs`，再运行 `npm run check`，必要时执行浏览器 smoke check，最后只重新暂存提交前已经暂存且被格式化修改的文件。

## 6. `.pi/`

### 6.1 `.pi/extensions/`

| 文件 | 用途 |
|---|---|
| `import-repro.ts` | `/ir` 命令：导入 Issue 分析工作流上传的 gist 会话，改写 checkout 路径并切换到该会话。 |
| `prompt-url-widget.ts` | 从 PR、Issue 或安全公告提示中提取 URL，在 TUI 中显示对应元数据。 |
| `redraws.ts` | `/tui` 命令：查看 TUI 全量重绘统计，用于渲染性能诊断。 |
| `tps.ts` | 显示 tokens-per-second 等模型流式输出性能指标。 |

### 6.2 `.pi/prompts/`

| 文件 | 用途 |
|---|---|
| `cl.md` | `/cl`：审核最新变更并维护各包 `[Unreleased]` 变更日志。 |
| `is.md` | `/is`：分析 GitHub Issue、定位问题并给出技术结论。 |
| `pr.md` | `/pr`：按仓库规则检查或准备 PR。 |
| `sa.md` | `/sa`：安全公告分析和更新流程。 |
| `wr.md` | `/wr`：工作项/评审回复流程，并规定 AI 生成评论免责声明。 |

### 6.3 其他 `.pi` 子目录

- `.pi/skills/add-llm-provider.md`：新增 LLM 供应商的仓库专用技能说明。
- `.pi/git/.gitignore`、`.pi/npm/.gitignore`：保留空目录，用于隔离的 Git/npm 临时状态，但不提交其中内容。

## 7. `scripts/`

### 7.1 构建、检查与依赖安全

| 文件 | 用途 |
|---|---|
| `agent-treeshake-smoke-entry.ts` | agent 包 tree-shaking smoke test 的入口。 |
| `browser-smoke-entry.ts` | 浏览器兼容打包测试入口，避免 Node 专用模块泄漏到浏览器路径。 |
| `check-browser-smoke.mjs` | 调用 esbuild 等工具验证浏览器构建。 |
| `check-lockfile-commit.mjs` | 未设置显式许可时阻止提交 lockfile/shrinkwrap 变更。 |
| `check-pinned-deps.mjs` | 验证外部直接依赖使用精确版本。 |
| `check-ts-relative-imports.mjs` | 检查 TypeScript 源码的相对导入扩展名约定。 |
| `generate-coding-agent-install-lock.mjs` | 生成安装器/自更新器使用的独立 install lock。 |
| `generate-coding-agent-shrinkwrap.mjs` | 从根 lockfile 生成发布到 CLI 包内的 shrinkwrap，并审核生命周期脚本白名单。 |
| `generate-thinking-capabilities.mjs` | 从模型数据归纳或生成 thinking 能力信息。 |
| `update-source-imports-to-ts.sh` | 批量把源码相对导入从 `.js` 改为 `.ts`，编译时再由 TS 重写回 `.js`。 |

### 7.2 发布与制品

| 文件 | 用途 |
|---|---|
| `build-binaries.sh` | 构建 Bun 独立二进制并整理运行时资源。 |
| `create-source-archive.sh` | 创建可复现的发布源码压缩包和校验信息。 |
| `local-release.mjs` | 在仓库外创建未发布的 Node/Bun 安装，用于发布前 smoke test。 |
| `package-workspaces.mjs` | 根据根 workspace 配置发现实际包目录。 |
| `publish.mjs` | 发布全部非私有 workspace 包，支持 dry-run。 |
| `release-packages.mjs` | 返回待发布的公共包清单，供其他发布脚本复用。 |
| `release.mjs` | 完整版本发布编排：检查、升版、更新 changelog、生成制品、提交、打 tag 和推送。 |
| `release-notes.mjs` | 从 changelog 提取 GitHub Release 说明，或修复历史说明中的链接。 |
| `publish-release-announcement.mjs` | 验证 npm 包已可获取后，原子更新 R2 的最新版本标记。 |
| `publish-release-announcement.test.mjs` | 测试版本比较、并发更新和不回退语义。 |
| `sync-versions.js` | 校验公共包锁步版本，并同步所有内部依赖版本。 |
| `sync-versions.test.mjs` | `sync-versions.js` 的回归测试。 |

### 7.3 模型目录

| 文件 | 用途 |
|---|---|
| `diff-model-catalog.mjs` | 对比两份生成的模型目录，展示供应商/模型元数据变化。 |
| `publish-model-catalog.mjs` | 校验模型数和必需供应商，生成版本化目录并发布到对象存储。 |

### 7.4 性能、统计与诊断

| 文件 | 用途 |
|---|---|
| `cost.ts` | 汇总会话 token 成本。 |
| `edit-tool-stats.mjs` | 分析历史会话中的 edit 工具调用表现。 |
| `read-tool-stats.mjs` | 分析 read 工具输出规模、截断和使用分布。 |
| `profile-coding-agent-node.mjs` | 对 TUI 或 RPC 启动路径生成 Node CPU profile。 |
| `session-context-stats.mjs` | 统计会话上下文、模型、命令过滤和 token 分布。 |
| `session-transcripts.ts` | 导出指定工作目录的会话文本，按上下文大小切片，可调用子 agent 分析。 |
| `stats.ts` | 汇总本地 Pi 会话中的模型使用量与成本。 |
| `tool-stats.ts` | 生成工具调用次数、错误、输出 token 等 HTML 报告。 |
| `repro-5893-wsl-bash.mjs` | Windows/WSL bash 问题 #5893 的定向复现脚本。 |

## 8. `packages/` 总览

每个可发布包通常包含：

- `package.json`：名称、导出、依赖和包级命令。
- `README.md`：公共 API 和使用说明。
- `CHANGELOG.md`：该包版本历史；新内容写入 `[Unreleased]`。
- `tsconfig.build.json`：生成 `dist/` 的 TypeScript 构建配置。
- `vitest.config.ts` 或 `tsconfig.test.json`：包级测试设置。
- `src/`：源代码；`test/`：单元、集成和回归测试；`dist/`：生成结果。

### 8.1 `packages/telemetry/`

职责：提供供应商无关的显式遥测上下文、span、类型化 schema、内存参考实现和适配器一致性测试；不绑定 OpenTelemetry、Sentry 等具体后端。

```text
telemetry/
├─ src/
│  ├─ index.ts                 公共类型、schema 推导和 typed span starter
│  ├─ noop.ts                  不记录数据的 NOOP_TELEMETRY_CONTEXT
│  ├─ memory.ts                确定性的内存 span 记录器
│  └─ testing/
│     ├─ index.ts              测试子路径桶文件
│     ├─ types.ts              适配器 fixture 和标准化记录类型
│     └─ conformance.ts        后端适配器一致性用例生成器
└─ test/
   ├─ telemetry.test.ts        schema、noop 和内存实现测试
   └─ conformance.test.ts      参考实现通过一致性套件的测试
```

### 8.2 `packages/ai/`

职责：统一多供应商 LLM API，处理模型目录、鉴权、流式响应、工具调用、thinking、图片生成、成本和跨供应商上下文转换。

#### `packages/ai/` 顶层

| 文件/目录 | 用途 |
|---|---|
| `bedrock-provider.js`、`.d.ts` | Node/Bun 对 Bedrock provider 的兼容导出包装。 |
| `scripts/` | 生成、校验和维护模型数据。 |
| `src/` | AI 核心实现。 |
| `test/` | 供应商转换、鉴权、流式协议和回归测试。 |

#### `packages/ai/scripts/`

- `generate-models.ts`：拉取/整合供应商模型信息并生成聊天模型目录。
- `generate-image-models.ts`：生成图片模型目录。
- `check-model-data.ts`：校验生成模型数据的新鲜度和结构。
- `model-data.ts`：生成脚本共享的数据结构与处理逻辑。
- `models-dev-reasoning-options.ts`：维护开发阶段的 reasoning 能力覆盖值。
- `generate-test-image.ts`：生成图片 API 测试素材。

#### `packages/ai/src/` 一级文件

| 文件 | 用途 |
|---|---|
| `index.ts` | 主公共入口，导出模型、鉴权、消息、事件、校验和辅助 API。 |
| `types.ts` | LLM 消息、模型、内容块、工具调用、流式事件、usage 和 thinking 的核心类型。 |
| `models.ts` | `Models`/`MutableModels` 注册表、provider 创建、模型选择、流调用、成本和 thinking 能力。 |
| `models-store.ts` | 可替换的模型目录存储接口和内存实现。 |
| `models.generated.ts` | 脚本生成的聊天模型元数据；禁止直接编辑。 |
| `model-catalog.ts` | 类型化模型组展平和目录类型。 |
| `image-models.generated.ts` | 脚本生成的图片模型元数据。 |
| `images-models.ts` | 图片 provider/model 注册表。 |
| `images-api-registry.ts` | 图片 API 实现注册与查找。 |
| `images.ts` | 图片生成的公共调用和结果类型。 |
| `session-resources.ts` | 模型会话资源的保存、恢复或跨请求传递。 |
| `env-api-keys.ts` | 供应商到环境变量 API key 的映射。 |
| `oauth.ts`、`bun-oauth.ts` | OAuth 公共入口及 Bun 运行时装配。 |
| `cli.ts` | `pi-ai` 模型查询/鉴权相关命令行入口。 |
| `compat.ts`、`compat/`、`legacy-api-aliases.ts` | 兼容层和扩展 OAuth 类型；隔离旧 API 名称。 |
| `bedrock-provider.ts` | Node 专用 Bedrock 供应商加载。 |

#### `packages/ai/src/api/`

这里放“供应商协议适配器”，负责把统一消息转换成各厂商请求，并把 SSE/WebSocket/HTTP 响应还原为统一流事件。

- `anthropic-messages.ts`、`google-generative-ai.ts`、`google-vertex.ts`、`bedrock-converse-stream.ts`、`mistral-conversations.ts`：各自原生消息协议。
- `openai-completions.ts`、`openai-responses.ts`、`openai-codex-responses.ts`、`azure-openai-responses.ts`：OpenAI 系协议变体。
- `pi-messages.ts`：Pi 自有消息 API。
- `openrouter-images.ts`：OpenRouter 图片生成协议。
- 同名 `.lazy.ts`：延迟加载包装，减少默认 bundle 和浏览器导入成本。
- `google-shared.ts`、`openai-responses-shared.ts`：同族 API 共用转换逻辑。
- `transform-messages.ts`：跨供应商消息规范化与 handoff。
- `constrained-sampling.ts`、`simple-options.ts`：统一采样参数和简化选项。
- `openai-prompt-cache.ts`、`github-copilot-headers.ts`、`cloudflare*.ts`：特定平台缓存、请求头和网关绑定。
- `lazy.ts`：通用 API 延迟装载器。

#### `packages/ai/src/auth/`

- `types.ts`：API key、OAuth credential、credential store、交互事件和鉴权结果类型。
- `context.ts`：默认鉴权上下文。
- `credential-store.ts`：凭据存储接口的内存实现。
- `resolve.ts`：按覆盖值、存储和环境变量解析 provider 鉴权。
- `helpers.ts`：API key/OAuth provider 的构造辅助。
- `oauth/`：Anthropic、OpenAI Codex、GitHub Copilot、OpenRouter、Kimi、xAI、Radius 的登录流程；`pkce.ts`、`device-code.ts`、`oauth-page.ts` 是共用 OAuth 基础设施，`load.ts` 负责延迟注册和加载。

#### `packages/ai/src/providers/`

每个 `name.ts` 定义 provider 的鉴权、API 和行为；相邻的 `name.models.ts` 是该 provider 的生成模型目录。当前覆盖 Amazon Bedrock、Anthropic、OpenAI、OpenAI Codex、Azure OpenAI、Google、Vertex、OpenRouter、Mistral、Groq、Cerebras、Fireworks、Baseten、Together、NVIDIA、Hugging Face、DeepSeek、xAI、ZAI、Kimi/Moonshot、MiniMax、Xiaomi、Qwen、OpenCode、Cloudflare、Vercel AI Gateway、Radius 和 Ant Ling 等。

- `all.ts`：注册所有内建文本和图片 provider。
- `faux.ts`：测试使用的确定性假 provider，不调用真实 API。
- `cloudflare-auth.ts`、`cloudflare-stream.ts`：Cloudflare 系列共享实现。
- `radius-config.ts`：Radius 网关配置。
- `openrouter-images.ts`、`images/register-builtins.ts`：图片 provider 注册。
- `data/`：生成的 provider JSON 模型数据，默认被 Git 忽略，构建时复制进 `dist/`。
- `data-json.d.ts`：JSON 模型数据的模块类型声明。

#### `packages/ai/src/utils/`

按文件名提供横切能力：取消信号、诊断、错误体读取、token 估算、事件流、hash、headers、宽松 JSON、HTTP 代理、上下文溢出判断、provider 环境、重试、Unicode 清理、文本提取、TypeBox 辅助、UUID 和运行时校验。`deferred-tools.ts` 专门处理延迟工具协议；`pi-user-agent.ts` 生成 Pi 请求标识。

#### `packages/ai/test/`

测试按供应商或能力命名：

- `*-oauth.test.ts`、`*-credentials.test.ts`：鉴权与 token 刷新。
- `*-models.test.ts`、`model-data-*.test.ts`：模型目录和能力元数据。
- `openai-*`、`anthropic-*`、`google-*`、`bedrock-*`、`mistral-*`：消息转换、thinking、缓存、tool call 和流式事件。
- `*-e2e.test.ts`、`*-smoke.test.ts`：需要外部端点/凭据的真实集成场景，不能混入默认测试。
- `retry.test.ts`、`overflow.test.ts`、`validation.test.ts`、`uuid.test.ts` 等：通用工具单元测试。
- `faux-provider.test.ts`：无付费调用的假 provider 测试。
- `data/red-circle.png`：图片输入/输出测试 fixture。

### 8.3 `packages/agent/`

职责：提供通用有状态 Agent、LLM/tool 循环和新的持久化 `AgentHarness`。`agent.ts` 是轻量内存 Agent，`harness/` 是可恢复、可分支、可持久化的更高层执行框架。

#### `packages/agent/src/`

| 文件 | 用途 |
|---|---|
| `index.ts` | 运行时中立的公共入口。 |
| `node.ts` | Node 专用导出，包括文件/进程工具和 JSONL 会话实现。 |
| `agent.ts` | `Agent` 类：状态、订阅、prompt/continue、steer/follow-up、abort。 |
| `agent-loop.ts` | 低层异步事件循环：调用 LLM、执行工具、发出 turn/message/tool 事件。 |
| `types.ts` | AgentState、AgentTool、AgentEvent、hook 和消息扩展类型。 |
| `stream-fn.ts` | 抽象模型流函数，使 agent 与具体模型注册表解耦。 |
| `proxy.ts` | 通过后端代理转发模型流的客户端实现。 |
| `search/` | 会话搜索公共接口和默认扫描实现。 |

#### `packages/agent/src/harness/`

| 路径 | 用途 |
|---|---|
| `agent-harness.ts` | Harness 总协调器和公共操作入口。 |
| `reducer.ts` | 把持久化记录归约成当前会话、lane 和操作状态。 |
| `events.ts` | Harness 事件和订阅协议。 |
| `messages.ts` | Harness 记录与 AI 消息间的转换。 |
| `result.ts` | 操作结果和错误表达。 |
| `types.ts` | Harness 公共状态、hook、操作与存储类型。 |
| `system-prompt.ts` | 组装系统提示和项目上下文。 |
| `prompt-templates.ts` | 提示模板加载与参数替换。 |
| `skills.ts` | `SKILL.md` 发现、校验和提示格式化。 |
| `telemetry.ts` | `pi.ai.*`、`pi.harness.*`、`pi.session.*` 类型化遥测 schema。 |
| `compaction/` | 上下文压缩、分支摘要、cut point 和 token 估算。 |
| `env/nodejs.ts` | Node 环境的文件、进程和时钟能力装配。 |
| `session/` | 会话仓库接口、内存实现、上下文构建和状态模型。 |
| `session/jsonl/` | JSONL codec、错误、仓库和存储实现。 |
| `session/testing/` | 任意会话后端必须通过的一致性测试定义。 |
| `tools/` | bash、read、write、edit、image 工具；还含 diff、路径安全、文件修改队列和 tool context。 |
| `utils/` | shell 输出规范化和大输出截断。 |

`docs/harness.md` 是 Harness 的完整实现规范；`docs/search.md` 解释搜索接口和索引后端；`docs/telemetry-schema.md` 是生成的遥测字段说明。`scripts/generate-telemetry-docs.ts` 从 schema 更新后者。

`test/` 与上述模块镜像：根级文件测试旧 Agent/loop/proxy，`test/harness/` 测试 reducer、恢复、压缩、技能、提示和工具，`test/harness/session/` 测试内存与 JSONL 后端，`test/utils/` 是工具 fixture。`e2e.test.ts` 是需要模型环境的端到端测试。

### 8.4 `packages/session-backends/sqlite-node/`

职责：把 `agent` 的会话仓库接口实现为 Node `node:sqlite` 后端，提供迁移、物化分支缓存、写者租约、统计和可选 FTS 搜索。

```text
sqlite-node/
├─ scripts/prepare-dist.mjs       构建后把 SQL migration 等非 TS 资源复制进 dist
├─ src/index.ts                   node:sqlite DatabaseSync 适配器和公共导出
└─ src/sqlite/
   ├─ index.ts                    SQLite 后端桶文件
   ├─ types.ts                    数据库、事务和仓库选项类型
   ├─ sql.ts                      SQL 执行、参数和事务辅助
   ├─ migrations.ts               迁移发现、排序和执行
   ├─ migrations/001_initial.sql  初始数据库 schema、索引和触发器
   ├─ repo.ts                     SqliteSessionRepository 主实现
   ├─ branch-cache.ts             物化分支路径的构建与增量维护
   ├─ search-backend.ts           FTS 初始化、索引同步和搜索
   └─ storage/
      ├─ sessions.ts              会话元数据
      ├─ entries.ts               不可变会话条目
      ├─ branch-entries.ts        分支条目查询
      ├─ branch-tips.ts           分支叶节点/指针
      ├─ lanes.ts                 并行 lane 状态
      ├─ facts.ts                 可更新事实寄存器
      ├─ records.ts               通用记录读写
      ├─ session-sequences.ts     会话内单调序号
      ├─ session-stats.ts         usage 与会话统计
      └─ writer-leases.ts         单写者协调和过期租约
```

`test/` 分别覆盖 adapter、仓库一致性、分支查询/cache、facts/log 查询、迁移、搜索、SQL 和写者租约；`test-utils.ts` 提供临时数据库 fixture。

### 8.5 `packages/protocol/`

职责：定义远程 Pi 会话协议 v1。线格式为 4 字节大端长度加一个严格 CBOR item；传输层由调用方提供。

| 路径 | 用途 |
|---|---|
| `src/schemas.ts` | TypeBox 消息 schema：hello、命令、响应、事件、模型、会话 snapshot 和 transcript。 |
| `src/codec.ts` | schema 校验、完整消息编码、增量客户端/服务端解码器。 |
| `src/framing.ts` | 长度前缀编码、最大帧限制和碎片/合并帧解码。 |
| `src/cbor/options.ts` | CBOR 深度、大小和集合元素限制。 |
| `src/cbor/encoder.ts` | 严格 RFC 8949 子集编码。 |
| `src/cbor/decoder.ts` | 严格 CBOR 解码和非法值拒绝。 |
| `src/cbor/index.ts`、`src/index.ts` | 子模块和包公共桶文件。 |
| `test/cbor/cbor.test.ts` | CBOR 合法值、边界和拒绝场景。 |
| `test/framing.test.ts` | 分帧、碎片、长度限制和截断测试。 |
| `test/protocol.test.ts` | schema、握手和消息 codec 测试。 |

### 8.6 `packages/client/`

职责：在任意有序字节传输上提供远程 Pi 客户端；根入口不依赖 Node，Unix socket 通过单独子路径导出。

| 文件 | 用途 |
|---|---|
| `src/client.ts` | `PiClient` 公共 API：连接、重连、列举/创建/获取会话。 |
| `src/connection.ts` | 握手、request ID 关联、入站事件和断线状态机。 |
| `src/transport.ts` | `ByteTransport`/factory 抽象，隔离 WebSocket、socket 等具体实现。 |
| `src/unix.ts` | Node/Bun Unix-domain socket transport factory。 |
| `src/session-handle.ts` | 独占/共享 `SessionLease`、detach/dispose 和本地所有权规则。 |
| `src/state.ts` | 权威 server/session snapshot 缓存和订阅。 |
| `src/promise.ts` | 请求关联使用的 deferred promise 辅助。 |
| `src/errors.ts` | 断线、服务端、所有权、已释放会话等结构化错误。 |
| `src/types.ts` | 客户端事件、选项和监听器类型。 |
| `src/index.ts` | 公共导出入口。 |

`test/` 按 connection、requests、sessions、state、disposal 和 unix transport 划分；`support.ts` 提供内存传输/协议测试支撑。

### 8.7 `packages/server/`

职责：实验性远程会话服务端。它实现协议和连接协调，但不包含独立 CLI，也不决定会话怎样持久化；应用通过 `PiServerService` 注入业务实现。

| 路径 | 用途 |
|---|---|
| `src/server.ts` | `PiServer` 生命周期和 listener 装配。 |
| `src/listener.ts` | 传输监听器抽象。 |
| `src/connection.ts` | 单连接握手、状态和字节 I/O 抽象。 |
| `src/sessions.ts` | attach/detach、共享/独占锁和会话命令路由。 |
| `src/snapshots.ts` | 构建权威 server/session snapshot。 |
| `src/protocol.ts` | `pi-ai` 领域消息到 `pi-protocol` DTO 的严格、安全转换。 |
| `src/types.ts` | `PiServerService`、runtime handle 和 server 配置类型。 |
| `src/errors.ts` | busy、locked、not found、not implemented 等协议错误。 |
| `src/transports/unix/` | Unix socket listener、地址/权限选项和 `createUnixServer` 预设。 |
| `src/testing/` | 内存 wire channel、协议测试客户端、测试 server/service，供自定义 transport 做一致性验证。 |

`test/` 覆盖 server 生命周期、listener、协议桥、会话锁和 Unix 连接；`fixtures/stale-socket-server.mjs` 用于验证陈旧 socket 清理。

### 8.8 `packages/tui/`

职责：终端 UI 库，提供 ANSI/Unicode 感知的差分渲染、主屏/备用屏、约束布局、输入编辑、控件、图片和原生终端兼容模块。

#### `packages/tui/native/`

- `darwin/src/darwin-modifiers.c`：读取 macOS 终端修饰键状态；`build.sh` 编译，`prebuilds/*/*.node` 是 arm64/x64 预编译模块。
- `win32/src/win32-console-mode.c`：读取/调整 Windows console mode；`build.mjs` 编译，`prebuilds/*/*.node` 是 arm64/x64 预编译模块。
- 两个平台的 `README.md` 记录构建和运行要求。

#### `packages/tui/src/` 渲染与输入基础

| 文件 | 用途 |
|---|---|
| `tui.ts` | `Component`、`Container`、overlay、焦点、TUI 基类和 viewport 接口。 |
| `tui-main-screen.ts` | 保留终端 scrollback 的主屏差分渲染器。 |
| `tui-alt-screen.ts` | 固定 viewport 的 alternate-screen 渲染、滚动、选择、鼠标和布局。 |
| `terminal.ts` | 真实 stdin/stdout terminal、键盘协议协商和平台输入规范化。 |
| `layout.ts`、`layout-node.ts` | VStack/HStack/ScrollView 的尺寸分配、绘制树和命中测试。 |
| `alt-screen-search.ts` | alternate screen 内搜索和匹配导航。 |
| `editor-component.ts` | 编辑器公共协议。 |
| `autocomplete.ts` | slash command 和文件路径补全。 |
| `keybindings.ts`、`keys.ts` | 可配置动作映射和终端按键序列解析。 |
| `stdin-buffer.ts` | 处理拆分/合并的 stdin escape sequence 和粘贴输入。 |
| `kill-ring.ts`、`undo-stack.ts`、`word-navigation.ts` | Emacs 风格删除环、撤销/重做和 Unicode 单词移动。 |
| `fuzzy.ts` | 模糊匹配和排序。 |
| `latex.ts` | LaTeX 数学表达式的终端文本转换。 |
| `terminal-colors.ts` | 终端颜色探测和转换。 |
| `terminal-image.ts` | Kitty/iTerm2 图片协议、尺寸解析、裁剪和 fallback。 |
| `native-modifiers.ts` | 加载 Darwin/Win32 原生模块。 |
| `utils.ts` | ANSI 保留的宽度、截断、换行、切片、OSC 链接和 grapheme 工具。 |
| `index.ts` | 包公共出口。 |

#### `packages/tui/src/components/`

- 容器/布局：`box.ts`、`stack.ts`、`v-stack.ts`、`h-stack.ts`、`scroll-view.ts`、`spacer.ts`。
- 文本展示：`text.ts`、`truncated-text.ts`、`markdown.ts`。
- 输入：`input.ts`、`editor.ts`。
- 选择与设置：`select-list.ts`、`settings-list.ts`。
- 状态：`loader.ts`、`cancellable-loader.ts`、`alt-screen-flash.ts`。
- 媒体：`image.ts`。

`test/` 既有常规 `.test.ts`，也有可运行 demo/benchmark/复现文件：`chat-simple.ts` 是完整聊天 UI 示例，`virtual-terminal.ts` 和 `test-themes.ts` 是测试基础设施，`render-churn-bench.ts` 是重绘基准，`image-test.ts`、`key-tester.ts`、`viewport-overwrite-repro.ts` 是人工诊断程序。以 `regression-` 或 `bug-regression-` 开头的文件固定历史问题。

### 8.9 `packages/coding-agent/`

职责：最终用户使用的 `pi` CLI。它把 `ai`、`agent` 和 `tui` 组合为交互式编码代理，并提供内建文件/命令工具、会话树、压缩、扩展、skills、packages、主题、RPC 和 SDK。

#### 顶层

| 文件/目录 | 用途 |
|---|---|
| `src/` | CLI 和 SDK 实现。 |
| `docs/` | 面向用户和扩展作者的完整文档站点内容。 |
| `examples/` | SDK、RPC 和扩展示例。 |
| `test/` | 单元、集成、CLI、服务端和 Issue 回归测试。 |
| `install-lock/` | 安装器和自更新流程使用的最小 package 清单及 lockfile。 |
| `scripts/migrate-sessions.sh` | 批量迁移历史 session 文件。 |
| `npm-shrinkwrap.json` | 发布包的传递依赖锁定文件，由根脚本生成。 |

#### `packages/coding-agent/src/` 入口

| 文件 | 用途 |
|---|---|
| `cli.ts` | Node `pi` 可执行入口：设置进程标记、HTTP dispatcher 并调用 `main()`。 |
| `bun/cli.ts` | Bun 独立二进制入口；同目录装配 Bedrock 和 sandbox 环境恢复。 |
| `main.ts` | 解析配置后选择 interactive、print、JSON/RPC 或实验性远程模式。 |
| `index.ts` | SDK 和扩展作者使用的主要公共出口。 |
| `config.ts` | 应用名、版本、agent 目录、包目录、文档/示例路径解析。 |
| `migrations.ts` | 设置、资源或会话格式的启动迁移。 |
| `rpc-entry.ts` | 可单独加载的 RPC 入口。 |
| `package-manager-cli.ts` | Pi package 安装、更新、移除相关 CLI。 |

#### `packages/coding-agent/src/cli/`

- `args.ts`：全部 CLI 参数和简写解析。
- `initial-message.ts`、`file-processor.ts`：组合命令行文本、stdin 和附件。
- `auth-command.ts`、`auth-check.ts`、`credential-print.ts`：登录、鉴权诊断和凭据展示。
- `list-models.ts`、`config-selector.ts`、`session-picker.ts`、`startup-ui.ts`：启动前模型、配置、会话和交互选择。
- `project-trust.ts`：首次进入项目时的信任确认。
- `experimental/`：远程 client/server/pi 命令、实验性选项和 transport 地址解析；尚非稳定 CLI。

#### `packages/coding-agent/src/core/`

这是产品业务核心：

- 会话执行：`agent-session.ts`、`agent-session-runtime.ts`、`agent-session-services.ts`、`sdk.ts`。
- 模型与鉴权：`model-runtime.ts`、`model-registry.ts`、`model-resolver.ts`、`model-config.ts`、`runtime-credentials.ts`、`auth-storage.ts`、`auth-guidance.ts`。
- 设置与资源：`settings-manager.ts`、`resource-loader.ts`、`package-manager.ts`、`pi-manifest.ts`、`skills.ts`、`prompt-templates.ts`、`slash-commands.ts`。
- 安全边界提示：`project-trust.ts`、`trust-manager.ts`、`output-guard.ts`；它们不是 OS 沙箱。
- 消息与上下文：`messages.ts`、`system-prompt.ts`、`session-manager.ts`、`session-cwd.ts`、`source-info.ts`。
- 运行辅助：`event-bus.ts`、`diagnostics.ts`、`timings.ts`、`usage-totals.ts`、`cache-stats.ts`、`http-dispatcher.ts`、`provider-attribution.ts`、`provider-composer.ts`、`remote-catalog-provider.ts`、`resolve-config-value.ts`、`radius.ts`。
- `compaction/`：上下文压缩和分支摘要。
- `extensions/`：扩展发现、加载、事件运行器、类型和内建工具包装。
- `tools/`：`bash/read/write/edit/find/grep/ls`，以及截断、输出累积、路径、渲染和并发文件修改队列。
- `export-html/`：把 session 导出为独立 HTML；模板、CSS、浏览器 JS、Markdown/高亮 vendor 文件和工具渲染器均在此。

#### `packages/coding-agent/src/modes/`

- `print-mode.ts`：非交互 `-p` 输出。
- `json-event.ts`：机器可读事件格式。
- `rpc/`：stdin/stdout JSONL RPC server、client 和协议类型。
- `interactive/interactive-mode.ts`：完整 TUI 协调器。
- `interactive/external-editor.ts`：调用外部编辑器编辑提示。
- `interactive/model-search.ts`、`model-catalog-refresh.ts`：模型选择搜索和远程目录刷新。
- `interactive/theme/`：暗色/亮色主题、schema、加载和切换控制。
- `interactive/components/`：消息、工具执行、diff、footer、编辑器、选择器、登录、信任、设置、thinking、skills、tree、compaction/branch summary、Mermaid 和状态提示等 UI 组件。
- `interactive/assets/clankolas.png`：交互界面内置图片资源。

#### 其他源码目录

- `src/client/`：实验性远程会话在 coding-agent 侧的 transcript 和 `RemoteSession` 适配。
- `src/server/create-harness.ts`：把 coding-agent 会话创建能力适配到 `PiServerService`。
- `src/extensions/llama/`：llama.cpp 本地模型扩展，包括客户端、Hugging Face 下载、provider 和 UI。
- `src/utils/`：剪贴板、图片转换/缩放、EXIF、文件监听、Git、HTML、JSON、MIME、浏览器打开、路径、shell、语法高亮、版本检查和 Windows 自更新等平台工具。

#### `packages/coding-agent/docs/`

| 文档组 | 文件与用途 |
|---|---|
| 导航和入门 | `index.md` 文档首页；`quickstart.md` 安装和首次会话；`usage.md` 交互命令与 CLI 参考。 |
| 配置 | `settings.md`、`environment-variables.md`、`keybindings.md`、`themes.md`、`models.md`、`providers.md`。 |
| 扩展资源 | `extensions.md`、`skills.md`、`packages.md`、`prompt-templates.md`、`custom-provider.md`。 |
| 会话与 API | `sessions.md`、`session-format.md`、`compaction.md`、`sdk.md`、`rpc.md`、`json.md`、`tui.md`。 |
| 平台 | `terminal-setup.md`、`windows.md`、`termux.md`、`tmux.md`、`shell-aliases.md`、`llama-cpp.md`。 |
| 安全和开发 | `security.md`、`containerization.md`、`development.md`。 |
| 站点 | `docs.json` 定义文档站导航与展示配置；`images/` 保存截图和品牌图片。 |

#### `packages/coding-agent/examples/`

- `sdk/01-minimal.ts` 到 `13-session-runtime.ts`：从最小会话逐步覆盖自定义模型、提示、skills、tools、extensions、context 文件、模板、鉴权、设置、sessions、完全控制和 runtime 生命周期。
- `rpc-extension-ui.ts`：RPC 模式下扩展 UI 请求/响应示例。
- `extensions/`：每个 `.ts` 演示一个扩展点，文件名即场景，如命令、工具覆盖、输入转换、确认门、footer/header、状态、widget、overlay、游戏、git checkpoint、SSH、结构化输出等。
- `extensions/plan-mode/`：计划模式扩展示例。
- `extensions/subagent/`：多 agent 编排示例，`agents/` 是角色定义，`prompts/` 是组合工作流。
- `extensions/dynamic-resources/`：运行时注册 skill、prompt 和 JSON 资源。
- `extensions/doom-overlay/`：WASM Doom overlay 示例；`doom/build/` 是已构建 JS/WASM。
- `custom-provider-*`、`gondolin/`、`sandbox/`、`with-deps/`：需要独立 npm 依赖的 workspace 示例，各自包含私有 `package.json` 和 lockfile。

#### `packages/coding-agent/test/`

- 根级约 155 个测试按被测模块命名，覆盖 CLI 参数、资源加载、设置、模型解析、工具、扩展、UI、图片、更新、会话迁移等。
- `client/`：远程 session/client 适配测试。
- `server/`：coding-agent 到 server harness 的测试。
- `session-manager/`：会话文件解析、树、fork、compaction 和迁移。
- `suite/`：通过 `harness.ts` 和 faux provider 运行的编码代理行为套件。
- `suite/regressions/<issue>-<slug>.test.ts`：按 GitHub Issue 编号保存的回归测试，防止历史问题复发。
- `fixtures/empty-agent`、`empty-cwd`：空资源环境。
- `fixtures/skills/`：有效、缺字段、无 frontmatter、非法 YAML、名字冲突、嵌套等 skill 发现边界。
- `fixtures/skills-collision/`：两个来源都提供 `calendar` skill 的优先级测试。

### 8.10 `packages/evals/`

职责：用真实 `AgentSession` 和 `vitest-evals` 运行模型驱动的行为评估。它与普通测试不同：关注成功率、judge 分数、token、延迟和成本，并可能消耗真实模型额度。

| 路径 | 用途 |
|---|---|
| `scripts/run-evals.mjs` | 解析 provider/model 参数，创建制品目录并启动 Vitest eval 配置。 |
| `src/pi-harness.ts` | 把 coding-agent session 包装成 `vitest-evals` harness，隔离临时项目和 agent 目录。 |
| `src/smoke.eval.ts` | 基本问答/工具行为评估。 |
| `src/extensions.eval.ts` | 扩展创建、重载和使用行为评估。 |
| `src/vitest-evals/artifacts.ts` | 保存原生 session JSONL 和 run 索引。 |
| `src/vitest-evals/harness-table.ts` | 构造 baseline/candidate/repetition 对比矩阵。 |
| `src/vitest-evals/reporter.ts` | Vitest 自定义 reporter。 |
| `src/vitest-evals/summary.ts` | 汇总通过率提升、token、延迟和成本差异。 |
| `src/vitest-evals/setup.ts` | 注册测试生命周期和 artifact 捕获。 |
| `test/` | 不调用真实模型地测试 harness 基础设施、制品、矩阵和统计逻辑。 |
| `.gitignore` | 忽略 `.eval/` 运行制品。 |
| `vitest.config.ts` | 模型评估配置。 |
| `vitest.test.config.ts` | eval 基础设施自身的普通单元测试配置。 |

## 9. 生成目录和本地状态

当前工作树可见下列不应作为源码修改入口的目录：

- `packages/*/dist/`：各包最近一次构建结果。要修改行为，应编辑相应 `src/` 后重新构建。
- `packages/*/node_modules/`：npm workspace 链接或包级依赖视图。
- `packages/ai/src/providers/data/`：生成的模型 JSON 快照；由模型生成/下载流程维护。
- `packages/ai/dist/providers/data/`：上述数据的发布副本。
- `packages/coding-agent/install-lock/package-lock.json`：安装流程的生成锁文件，只能通过生成脚本更新。
- `packages/coding-agent/npm-shrinkwrap.json`：CLI 发布依赖快照，只能通过根生成脚本更新。

## 10. 常见修改从哪里开始

| 目标 | 首选入口 | 通常还要核对 |
|---|---|---|
| 新增/修改模型供应商 | `packages/ai/src/providers/<name>.ts`、`packages/ai/scripts/generate-models.ts` | `src/api/`、auth、生成模型数据、provider 测试、coding-agent 文档。 |
| 修改 LLM 消息或流事件 | `packages/ai/src/types.ts`、对应 `src/api/*.ts` | agent loop、server 协议桥、coding-agent UI、跨供应商测试。 |
| 修改通用 Agent 循环 | `packages/agent/src/agent-loop.ts`、`agent.ts` | agent tests、coding-agent AgentSession。 |
| 修改持久化 Harness | `packages/agent/src/harness/` | JSONL/SQLite 后端一致性、`docs/harness.md`。 |
| 修改内建工具 | `packages/coding-agent/src/core/tools/` | 对应 test、extensions wrapper、文档；低层通用工具则看 `packages/agent/src/harness/tools/`。 |
| 修改会话格式 | `packages/coding-agent/src/core/session-manager.ts` | migrations、session-manager tests、`docs/session-format.md`。 |
| 修改远程协议 | `packages/protocol/src/schemas.ts` | codec、client、server、coding-agent remote client/server。 |
| 修改 TUI 渲染 | `packages/tui/src/tui*.ts`、`layout*.ts` | virtual terminal tests、coding-agent interactive components。 |
| 新增交互控件 | `packages/coding-agent/src/modes/interactive/components/` | `index.ts` 导出、主题 token、UI 测试和 docs。 |
| 修改扩展 API | `packages/coding-agent/src/core/extensions/` | `src/index.ts`、examples、`docs/extensions.md`、回归测试。 |
| 修改发布流程 | 根 `package.json`、`scripts/release*.mjs` | workflow、lockfile/shrinkwrap、全部 changelog；按 `AGENTS.md` 发布步骤执行。 |

## 11. 总结

该仓库不是单一 CLI 项目，而是由可复用基础库、远程协议栈、持久化后端和最终 CLI 组成的 monorepo。最重要的边界有三条：

1. `ai` 只统一模型和供应商，不负责 Agent 状态机。
2. `agent` 负责模型/tool 循环与可恢复会话，`coding-agent` 负责产品配置、扩展、UI 和用户工作流。
3. `protocol` 只定义线格式；`client`、`server` 分别实现两端，具体传输和会话存储通过接口注入。

阅读代码时，从目标包的 `README.md -> src/index.ts -> 主实现 -> 对应 test` 进入，通常比从 CLI 入口一路追踪更快。

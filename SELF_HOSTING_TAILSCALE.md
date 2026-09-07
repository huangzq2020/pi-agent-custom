# Pi-Agent Mobile OS 自托管与 Tailscale 外网访问

本文面向从 GitHub 下载项目、希望只用自己的手机远程访问自己电脑的用户。该模式不需要项目维护者提供公共云服务器。项目文件和 Pi-Agent Runtime 都留在用户电脑上，Tailscale 只负责在用户已授权的设备之间建立私有网络。

## 1. 工作方式

```text
Android 手机
├── Pi-Agent Mobile OS
└── Tailscale
        │ HTTPS / WSS，仅限用户自己的 Tailnet
        ▼
Windows 电脑
├── Tailscale Serve
├── Mobile Gateway（127.0.0.1:8787）
├── Pi-Agent Runtime
└── 用户明确授权的项目目录
```

每位用户应使用自己的 Tailscale 账号和 Tailnet，不要加入项目维护者的私人网络。Gateway 始终监听 `127.0.0.1`，不需要路由器端口映射，也不要把 `8787` 直接开放到公网。

## 2. 电脑端准备

安装以下软件：

- Git
- Node.js 22.19.0 或更高版本
- Tailscale
- Pi-Agent 所需的模型账号或 API 配置

如果维护者已经提供正式 APK，用户不需要安装 Flutter。只有自行修改或编译 Android App 时才需要 Flutter 和 Android SDK。

从 GitHub 下载项目并安装依赖：

```powershell
git clone https://github.com/<owner>/<repository>.git
cd <repository>
npm ci --ignore-scripts
```

先按照 Pi-Agent 主项目文档完成模型配置，并确认普通 `pi` 命令可以正常调用模型。

## 3. 连接 Tailscale

1. 在 Windows 电脑和 Android 手机上安装 Tailscale。
2. 两端使用同一个用户自己的账号登录。
3. 确认电脑和手机都显示为在线。
4. 不要启用 Tailscale Funnel；本项目只使用 Tailnet 内部的 Tailscale Serve。

Tailscale 官方文档：

- [Tailnet 基本概念](https://tailscale.com/docs/concepts/tailnet)
- [Tailscale Serve 命令](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [MagicDNS](https://tailscale.com/docs/features/magicdns)

## 4. 生成个人 Token

在 PowerShell 中一次性粘贴下面四行。PowerShell 会从上到下依次执行，最后一行输出一个随机 Token：

```powershell
$tokenBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
$token = [Convert]::ToHexString($tokenBytes)
$token
```

把输出结果保存在密码管理器中。不要把真实 Token 写入 Git、README、截图或公开 Issue。

## 5. 启动 Gateway

在项目根目录打开 PowerShell。将项目目录和 Token 替换为用户自己的值：

```powershell
$env:PI_MOBILE_PROJECT_ROOTS = "D:\code"
$env:PI_MOBILE_TOKEN = "替换为刚才生成的随机Token"
$env:PI_MOBILE_HOST = "127.0.0.1"
$env:PI_MOBILE_PORT = "8787"

npm run dev --workspace=@earendil-works/pi-mobile-os
```

`PI_MOBILE_PROJECT_ROOTS` 是手机能够浏览和交给 Agent 操作的根目录。建议单独创建代码目录，例如 `D:\code`，不要授权整个系统盘、用户主目录或包含私人资料的目录。

成功时会显示：

```text
Pi-Agent Mobile OS gateway listening on http://127.0.0.1:8787
```

保持该窗口运行。

## 6. 使用 Tailscale Serve

打开另一个 PowerShell：

```powershell
tailscale serve --bg http://127.0.0.1:8787
tailscale serve status
```

命令会显示一个仅在用户 Tailnet 内可访问的 HTTPS 地址，例如：

```text
https://my-computer.example-tailnet.ts.net
```

`--bg` 会保存 Serve 配置。电脑重启后 Tailscale 可以恢复该代理，但 Mobile Gateway 进程仍需重新启动。

如需撤销代理：

```powershell
tailscale serve reset
```

## 7. 手机连接

保持手机 Tailscale 在线，先在手机浏览器访问：

```text
https://my-computer.example-tailnet.ts.net/v1/health
```

正常响应：

```json
{
  "status": "ok",
  "service": "pi-agent-mobile-os"
}
```

随后打开 Pi-Agent Mobile OS 的“绑定电脑”页面，填写：

```text
Gateway 地址：https://my-computer.example-tailnet.ts.net
绑定令牌：第 4 步生成的个人 Token
```

验证成功后，地址和 Token 会保存在 Android 安全存储中。App 会把 HTTPS 地址自动转换为 WSS 地址，用于接收 Agent 实时事件。

## 8. 每次重启电脑后

1. 确认 Tailscale 已连接。
2. 重新执行第 5 节的 Gateway 启动命令。
3. 使用 `tailscale serve status` 确认代理仍然存在。
4. 手机打开 Tailscale 后即可连接，无需 USB 数据线。

后续可以通过 Windows 任务计划程序或专用桌面启动器实现 Gateway 开机自启。不要把包含真实 Token 的启动脚本提交到 GitHub。

## 9. 常见问题

### 手机可以打开健康检查，但 App 显示 401

Gateway 地址正确，但 Token 不一致。重新复制电脑当前使用的 `PI_MOBILE_TOKEN`。

### 手机无法打开健康检查

依次检查：

1. 两端是否登录同一个 Tailnet。
2. 电脑 Gateway 是否仍在运行。
3. `tailscale serve status` 是否显示正确代理。
4. 手机是否允许 Tailscale VPN 连接。
5. Tailnet 的 Grants 或 ACL 是否阻止手机访问电脑。

### 能连接，但 Agent 无法运行

Gateway 网络已经正常，问题通常是电脑端 Pi-Agent 模型账号、API Key 或默认模型尚未配置。先在电脑终端直接运行 `pi` 验证。

### 为什么不能使用 `0.0.0.0:8787`

直接监听所有网卡会扩大暴露面。Tailscale Serve 可以把 Tailnet 内的 HTTPS 请求转发到本机 `127.0.0.1:8787`，因此无需公开 Gateway 端口。

## 10. 安全清单

- 每位用户单独生成 Token。
- Gateway 只监听 `127.0.0.1`。
- 不启用 Tailscale Funnel。
- 不做路由器端口转发。
- 只授权专门的项目目录。
- 手机丢失后立即从 Tailscale 管理页面移除设备。
- 多人 Tailnet 使用 [Tailscale Grants](https://tailscale.com/docs/features/access-control/grants) 限制设备访问范围。
- 修改文件和运行命令前检查当前仓库是否有可恢复的 Git 提交。

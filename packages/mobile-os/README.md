# @earendil-works/pi-mobile-os

Backend platform and Pi-Agent Runtime integration for the Pi-Agent Mobile OS Flutter app.

## Implemented system

```text
Flutter app
  ├─ encrypted computer binding and local/remote file browsers
  ├─ GitHub repository search and clone-to-computer
  ├─ project summary, technology analysis, and detailed analysis
  ├─ natural-language Agent tasks
  ├─ persistent conversation/task history
  ├─ workflow tasks, WebSocket status with polling fallback, cancellation, and results
  └─ code-change graph
          │ HTTP + WebSocket
          ▼
Mobile Gateway
  ├─ project path policy and bearer authentication
  ├─ project analyzer + capability engine
  ├─ authorized remote file browser and text preview
  ├─ GitHub repository search and constrained shallow clone
  ├─ in-process concurrent task queue
  ├─ durable task history under ~/.pi/mobile-os
  ├─ YAML DAG workflow engine
  ├─ local workflow marketplace registry
  ├─ Git change graph generator
  └─ runtime extension host
          │ createAgentSession()
          ▼
Pi-Agent Runtime
  └─ read/write/edit/bash or read-only tool policy per workflow step
```

The task queue and catalog are in-memory in this first deployable version. Their APIs are isolated so Redis/BullMQ and PostgreSQL stores can replace them without changing the mobile protocol.

## Run the gateway

From the repository root:

```powershell
$env:PI_MOBILE_PROJECT_ROOTS = "D:\code"
$env:PI_MOBILE_TOKEN = "replace-with-a-long-random-token"
$env:PI_MOBILE_HOST = "0.0.0.0"
npm run dev --workspace=@earendil-works/pi-mobile-os
```

Pi model credentials use the existing Pi-Agent configuration. Configure and verify the normal `pi` CLI before starting the gateway.

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PI_MOBILE_HOST` | `127.0.0.1` | Listen address. A token is mandatory outside loopback. |
| `PI_MOBILE_PORT` | `8787` | HTTP/WebSocket port. |
| `PI_MOBILE_TOKEN` | unset | Bearer token for HTTP and WebSocket connections. |
| `PI_MOBILE_PROJECT_ROOTS` | current directory | Semicolon-separated roots the phone may access. |
| `PI_MOBILE_WORKFLOW_DIR` | bundled workflows | YAML workflow directory. |
| `PI_MOBILE_MARKETPLACE_ROOT` | disabled | Root containing locally installable workflow packages. |
| `PI_MOBILE_ALLOWED_ORIGINS` | unset | Semicolon-separated browser origins for CORS. |
| `PI_MOBILE_CONCURRENCY` | `2` | Maximum concurrent Agent tasks. |
| `PI_MOBILE_DATA_DIR` | `~/.pi/mobile-os` | Durable task history directory. |
| `PI_MOBILE_GITHUB_TOKEN` | unset | Optional GitHub token for higher search rate limits. |

## API

All endpoints except health require `Authorization: Bearer <token>` when a token is configured.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/v1/health` | Liveness check. |
| `GET` | `/v1/device` | Return the bound computer identity and authorized roots. |
| `GET` | `/v1/files?path=...` | Browse authorized computer directories. |
| `GET` | `/v1/files/content?path=...` | Preview an authorized text file, capped at 512 KiB. |
| `GET` | `/v1/github/search?q=...` | Search public GitHub repositories. |
| `POST` | `/v1/github/clone` | Shallow-clone an HTTPS GitHub repository into an authorized root. |
| `POST` | `/v1/projects/analyze` | Analyze `{ "root": "..." }` and return the profile plus dynamic UI. |
| `GET` | `/v1/projects/:id/capabilities` | Return project-specific workflow buttons. |
| `GET` | `/v1/workflows` | List registered workflow definitions. |
| `POST` | `/v1/tasks` | Create a chat or workflow task. |
| `GET` | `/v1/tasks/:id` | Read a task snapshot and result. |
| `POST` | `/v1/tasks/:id/cancel` | Cancel queued or active work. |
| `GET` | `/v1/tasks/:id/events?after=N` | Replay events after a sequence number. |
| `WS` | `/v1/tasks/:id/events?after=N` | Replay then stream task events. |
| `GET` | `/v1/marketplace/workflows` | List locally installed packages. |
| `POST` | `/v1/marketplace/install` | Install a manifest inside the configured marketplace root. |

Task request examples:

```json
{ "projectId": "...", "kind": "chat", "prompt": "优化登录模块" }
```

```json
{ "projectId": "...", "kind": "workflow", "workflowId": "security_check" }
```

## Workflow DSL

Workflows are validated YAML DAGs. `needs` declares dependencies; all currently ready steps execute concurrently. A step invokes either a registered backend tool or Pi-Agent.

```yaml
id: review
name: Review
description: Review current changes
version: 1.0.0
steps:
  - id: changes
    tool: git_change_graph
  - id: report
    needs: [changes]
    readOnly: true
    agent: |
      Review these changes and report concrete defects:
      {{steps.changes}}
```

Bundled workflows cover project analysis, bug scanning, security review, code explanation, test generation, refactoring, Redis review, and Docker review.

## Runtime extensions

Extensions can validate a task, add mobile context to prompts, observe tool/text events, and process results:

```ts
extensions.register({
  id: "organization-policy",
  beforeTask(context) {
    if (context.project.name === "production") throw new Error("Direct production changes are disabled");
  },
  transformPrompt(prompt) {
    return `${prompt}\nFollow the organization secure coding standard.`;
  },
});
```

## Security boundary

- Canonical paths must remain under `PI_MOBILE_PROJECT_ROOTS`; symlink targets are resolved before authorization.
- Git clone destinations must be direct children of an authorized existing directory, and only HTTPS GitHub URLs are accepted.
- Non-loopback listening requires a bearer token.
- Read-only workflow steps receive only `read`, `grep`, `find`, and `ls` Pi tools.
- Workflow YAML cannot execute arbitrary shell commands directly. It can only use backend-registered tools or an explicit Agent step.
- Write-capable workflows require confirmation in the Flutter UI.
- Marketplace packages can only be loaded from the configured local root, and workflow paths cannot escape their package directory.

For deployment beyond a trusted LAN, terminate TLS at a reverse proxy and store the bearer token in the platform keystore rather than source control.

## Verification

```powershell
npm run typecheck --workspace=@earendil-works/pi-mobile-os
npm run test --workspace=@earendil-works/pi-mobile-os
npm run build --workspace=@earendil-works/pi-mobile-os
```

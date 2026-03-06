# Remote Vibe Coding Control

中文 | [English](#english)

## 中文

一个基于 Cloudflare 免费能力的远程 Codex 控制台，用于你不在办公室时通过网页接管本地 Codex。

### 功能

- 展示本地 Codex 的项目、线程、消息
- 支持新增线程、重命名线程、进入线程发送消息
- 全链路密文传输与存储（Worker/KV 不保存明文业务数据）
- Web 每次访问都必须输入主密钥解锁
- 页面内置本地控制端下载链接与教程链接
- 本地变更驱动同步：仅检测到本地变化时才上传快照，降低 KV 写入
- 顶部显示 Agent 在线状态（在线/离线）
- 当 Cloudflare KV 配额/限流触发时，Agent 自动退避重试，不会崩溃退出

### 架构

- `Cloudflare Worker + KV`
  - 存密文快照与密文操作队列
  - `AGENT_TOKEN` 鉴权本地 Agent
  - `viewer proof`（由主密钥派生）鉴权 Web 管理页面
- `Local Agent`
  - 读取 `~/.codex/sessions` 聚合项目/线程/消息
  - 执行远程操作（创建线程、发送消息、重命名）
  - 将快照加密后上传 Worker
- `Web Console`
  - 浏览器侧解密并渲染
  - 浏览器侧加密操作并下发到队列

### 快速部署

1. 安装依赖

```bash
npm install
```

2. 创建 KV（不要把真实 ID 提交到 GitHub）

```bash
npx wrangler kv namespace create STORE
npx wrangler kv namespace create STORE --preview
```

3. 在本地编辑 [wrangler.toml](wrangler.toml)

把下面两个占位符替换为你自己的值：

- `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`
- `REPLACE_WITH_YOUR_KV_PREVIEW_NAMESPACE_ID`

4. 配置 Worker Secret

```bash
npx wrangler secret put AGENT_TOKEN
```

5. 部署 Worker

```bash
npm run deploy:worker
```

6. 启动本地 Agent（办公室电脑）

```bash
export REMOTE_BASE_URL="https://<your-worker>.workers.dev"
export AGENT_TOKEN="<和 Worker secret 相同>"
export AGENT_ID="office-mac"
export MASTER_KEY="<你的主密钥>"
# 可选
export CODEX_HOME="$HOME/.codex"
export LOOP_INTERVAL_MS=2000
export POLL_INTERVAL_ACTIVE_MS=3000
export POLL_INTERVAL_IDLE_MS=15000
export ACTIVITY_WINDOW_MS=120000
export SNAPSHOT_DEBOUNCE_MS=1500
export PRESENCE_PING_INTERVAL_MS=300000
export LIVE_SYNC_INTERVAL_MS=10000
# 网络/配额容错（可选）
export REMOTE_RETRY_BASE_MS=15000
export REMOTE_RETRY_MAX_MS=300000
export REMOTE_QUOTA_COOLDOWN_MS=900000

npm run dev:agent
```

7. 打开网页并解锁

输入：

- `Agent ID`（例如 `office-mac`）
- `主密钥`（等于 `MASTER_KEY`）

### 安全建议

- 强烈建议使用 Cloudflare API Token（最小权限），不要长期使用 Global API Key
- `MASTER_KEY` 与 `AGENT_TOKEN` 都应使用高强度随机值
- 不要把真实 KV ID、Secret、主密钥提交到仓库

### 重要风险声明（高权限免审核模式）

- 本项目设计用于“你已明确授予本地 Codex 高权限且不需要人工逐次审核/授权”的场景
- 在该模式下，来自 Web 控制台的操作可由本地 Agent 直接执行，默认不经过人工确认
- 这会显著提升远程效率，但同时提高误操作与安全风险（包括但不限于代码改动、命令执行、分支切换）
- 如果你的环境没有像上述场景一样完成风险评估与充分授权，请不要直接使用本项目的默认执行模式
- 是否启用该模式应由你自行承担责任并基于组织/个人安全策略做最终决定
- 强烈建议仅向 Codex 提供测试/预发布环境（staging）的密钥与最小权限，不要授予生产环境密钥或生产写权限
- 使用者应自行承担授权配置不当导致的数据泄漏、服务中断、错误部署等后果；项目作者不对上述生产事故承担责任

### 典型工作流（全授权远程交付）

1. 你将 Cloudflare 部署权限和/或云服务器部署权限授予本地 Codex 运行环境
2. 你在外部通过 Web 控制台下发任务（编码、构建、部署、修复）
3. 本地 Agent 拉取任务并调用 Codex 执行，直接完成对应部署动作
4. 执行过程通过加密快照持续回传，Web 端可实时查看线程消息与状态
5. 部署完成后你在 Web 端核对结果，必要时继续下发增量修复任务

说明：该流程仅适用于你已完成授权与风险评估的环境，不建议在默认受控审批环境直接套用。

### 可靠性

- 快照上传基于本地文件指纹变化驱动（无变化不写入）
- Worker/KV 返回配额或限流错误时，Agent 会进入冷却并自动重试
- 远程异常期间 Agent 进程保持运行，配额恢复后自动恢复同步

### 许可证

本项目采用 `MIT` License，允许商用、修改、分发与私有使用，但不提供任何担保。详见 [LICENSE](LICENSE)。

---

## English

A Cloudflare-based remote Codex control console so you can control your office Codex from the web when away from your desk.

### Features

- View local Codex projects, threads, and messages
- Create threads, rename threads, and send prompts into a thread
- End-to-end encrypted payloads (Worker/KV stores ciphertext only)
- Web UI requires master key on every visit
- Built-in download and tutorial links for the local agent
- Change-driven sync: snapshots are uploaded only when local state changes
- Top bar shows agent online status (online/offline)
- Automatic backoff and recovery when Cloudflare KV hits quota/rate limits

### Architecture

- `Cloudflare Worker + KV`
  - Stores encrypted snapshots and encrypted operation queue
  - `AGENT_TOKEN` authenticates local agent
  - viewer proof (derived from master key) authenticates web viewer
- `Local Agent`
  - Reads `~/.codex/sessions` and builds project/thread/message snapshot
  - Executes remote operations (create thread, send message, rename)
  - Encrypts snapshot before upload
- `Web Console`
  - Decrypts data in browser
  - Encrypts operations in browser before enqueue

### Deployment

1. Install dependencies

```bash
npm install
```

2. Create KV namespaces (do not commit real IDs)

```bash
npx wrangler kv namespace create STORE
npx wrangler kv namespace create STORE --preview
```

3. Edit [wrangler.toml](wrangler.toml) locally

Replace placeholders with your own values:

- `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`
- `REPLACE_WITH_YOUR_KV_PREVIEW_NAMESPACE_ID`

4. Set Worker secret

```bash
npx wrangler secret put AGENT_TOKEN
```

5. Deploy Worker

```bash
npm run deploy:worker
```

6. Start local agent (office machine)

```bash
export REMOTE_BASE_URL="https://<your-worker>.workers.dev"
export AGENT_TOKEN="<same as Worker secret>"
export AGENT_ID="office-mac"
export MASTER_KEY="<your master key>"
# optional
export CODEX_HOME="$HOME/.codex"
export LOOP_INTERVAL_MS=2000
export POLL_INTERVAL_ACTIVE_MS=3000
export POLL_INTERVAL_IDLE_MS=15000
export ACTIVITY_WINDOW_MS=120000
export SNAPSHOT_DEBOUNCE_MS=1500
export PRESENCE_PING_INTERVAL_MS=300000
export LIVE_SYNC_INTERVAL_MS=10000
# optional: remote quota/network resilience
export REMOTE_RETRY_BASE_MS=15000
export REMOTE_RETRY_MAX_MS=300000
export REMOTE_QUOTA_COOLDOWN_MS=900000

npm run dev:agent
```

7. Open web console and unlock

Provide:

- `Agent ID` (for example, `office-mac`)
- `Master Key` (same as `MASTER_KEY`)

### Security Notes

- Prefer Cloudflare API Token (least privilege), avoid long-term Global API Key usage
- Use strong random values for `MASTER_KEY` and `AGENT_TOKEN`
- Never commit real KV IDs, secrets, or master keys

### Important Risk Notice (High-Privilege, No-Approval Mode)

- This project is intended for scenarios where you have explicitly granted high privileges to local Codex and do not require per-action human approval
- In this mode, operations sent from the web console can be executed directly by the local agent without interactive confirmation
- This improves remote productivity, but materially increases operational and security risk (including code changes, command execution, and branch switching)
- If your environment has not completed equivalent authorization and risk review, do not use the default execution mode of this project
- Enabling this mode is your own decision and responsibility, and should align with your organization/personal security policy
- Strongly provide only test/staging keys and least privileges to Codex; do not grant production keys or production write permissions
- Users are solely responsible for consequences caused by improper authorization configuration, including data leakage, outages, and incorrect deployments; project authors are not liable for such production incidents

### Typical Workflow (Fully Authorized Remote Delivery)

1. You grant Cloudflare deployment permissions and/or cloud server deployment permissions to the local Codex runtime
2. You submit tasks remotely from the web console (coding, build, deploy, and fixes)
3. The local agent pulls tasks and invokes Codex to execute, including deployment actions
4. Execution progress is continuously returned through encrypted snapshots, so thread messages and status are visible in near real time
5. After deployment, you verify outcomes in the web console and issue follow-up fix tasks if needed

Note: this workflow is only suitable for environments where authorization and risk review are already completed.

### Reliability

- Snapshot upload is change-driven by local file fingerprints (no local change, no snapshot write)
- If Worker/KV returns quota or rate-limit errors, Agent enters cooldown and retries later automatically
- Agent process keeps running during remote failures and recovers automatically when quota/network is back

### License

This project is licensed under the `MIT` License. Commercial use, modification, distribution, and private use are allowed, without warranty. See [LICENSE](LICENSE).

## Paths

- Worker API: [src/worker/index.ts](src/worker/index.ts)
- Web UI: [src/worker/web/app-js.ts](src/worker/web/app-js.ts)
- Local agent: [src/agent/index.ts](src/agent/index.ts)

# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0 - 2026-03-09

### Chinese

#### 新增

- 新增桌面、手机、平板三端自适应布局，并补齐移动端抽屉式导航流程。
- 新增 Markdown 渲染、代码块展示与一键复制能力。
- 新增 Agent 在线状态、刷新时间信息与更清晰的 Cloudflare KV 用量展示。
- 新增本地 Codex 线程与 Web 专属会话的界面区分与提示文案。

#### 调整

- 调整刷新策略，改为优先使用高频 Web 读取并压低远端写入压力。
- 调整快照同步逻辑，内容未变化时不再重复上传。
- 调整 Web 新建会话的产品定义，明确标注为不会出现在本地 Codex 客户端的 Web 专属会话。
- 调整桌面端自动刷新策略，用户选中文本时暂停刷新，结束选择后恢复。

#### 修复

- 修复 `pending` 用户消息会在真实消息确认前提前消失的问题。
- 修复部分场景下需要手动刷新才能看到新消息的问题。
- 修复桌面端阅读历史消息时会被强制拉回到底部的问题。
- 修复常见刷新与重试路径中的重复消息展示问题。
- 修复 Cloudflare KV 配额耗尽时本地 Agent 进程异常退出的问题。

### English

#### Added

- Added responsive layouts for desktop, mobile, and tablet, including a mobile drawer navigation flow.
- Added Markdown rendering, fenced code blocks, and copy actions for code snippets.
- Added agent online status, refresh metadata, and clearer Cloudflare KV quota visibility.
- Added clearer UI language separating local Codex threads from Web-only sessions.

#### Changed

- Changed the refresh model to favor frequent Web reads and lower remote write pressure.
- Changed snapshot syncing to skip uploads when the snapshot content has not changed.
- Changed Web-created conversations to be explicitly labeled as Web-only sessions that do not appear in the local Codex client.
- Changed desktop auto-refresh to pause while the user is selecting chat text.

#### Fixed

- Fixed pending user messages disappearing before the confirmed thread message appeared.
- Fixed delayed chat updates that previously required manual refresh in some flows.
- Fixed desktop chat history scrolling being forced back to the latest message.
- Fixed duplicate message rendering in common refresh and retry paths.
- Fixed local agent behavior so Cloudflare KV quota exhaustion no longer crashes the process.

export const APP_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#0e1116" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="RemoteVibe" />
    <title>Remote Vibe Coding Control</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icon.svg" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div id="unlock-modal" class="modal">
      <form id="unlock-form" class="modal-card">
        <h2 style="margin:0 0 8px 0">解锁远程控制台</h2>
        <p class="helper" style="margin:0 0 10px 0">每次访问都需要输入主密钥才能解密线程数据。</p>
        <div class="control-row">
          <input id="agent-id" placeholder="Agent ID（例如: office-mac）" required style="flex:1" />
        </div>
        <div class="control-row">
          <input id="master-key" type="password" placeholder="主密钥" required style="flex:1" />
        </div>
        <div class="control-row">
          <button type="submit" class="primary">解锁</button>
          <button type="button" id="unlock-reset" class="ghost">清空</button>
        </div>
        <div id="unlock-error" class="helper" style="color:#ff6f61"></div>
      </form>
    </div>

    <div class="shell">
      <div class="topbar">
        <div class="topbar-left">
          <button id="mobile-menu-toggle" class="mobile-menu-toggle" type="button" aria-label="打开菜单">☰</button>
          <div>
            <div class="brand">Remote Vibe Coding Control</div>
            <div class="badge" id="agent-badge">未连接</div>
          </div>
        </div>
        <div id="mobile-topbar-meta" class="mobile-topbar-meta">未连接 · --:-- · KV --</div>
        <div class="topbar-right">
          <div class="status" id="status-text">等待解锁</div>
          <div class="quota-wrap">
            <div class="quota-head" id="quota-text">额度: --</div>
            <div class="quota-bars">
              <div class="quota-bar"><div id="quota-primary-fill" class="quota-fill"></div></div>
              <div class="quota-bar"><div id="quota-secondary-fill" class="quota-fill"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="layout">
        <aside class="panel nav-panel">
          <div class="panel-head">
            <h3 class="panel-title">项目</h3>
            <div class="helper" id="project-count">0 项目</div>
          </div>
          <ul id="project-list" class="list"></ul>
        </aside>

        <aside class="panel nav-panel">
          <div class="panel-head">
            <h3 class="panel-title">线程</h3>
            <div class="control-row" style="margin-top:8px">
              <button id="new-thread-btn" class="primary">新增线程</button>
            </div>
          </div>
          <ul id="thread-list" class="list"></ul>
        </aside>

        <section class="main">
          <div id="messages" class="messages"></div>
          <button id="latest-jump-btn" class="latest-jump-btn hidden" type="button">↓ 回到最新</button>
          <div class="controls">
            <div class="control-row branch-row">
              <select id="branch-select" style="flex:1"></select>
              <button id="switch-branch-btn" class="ghost">切换分支</button>
            </div>
            <textarea id="prompt-input" placeholder="向当前线程发送消息...\n支持长文本"></textarea>
            <div class="control-row action-row">
              <button id="send-btn" class="primary">发送到线程</button>
              <div id="sync-menu-wrap" class="sync-menu-wrap">
                <button id="sync-menu-btn" class="ghost" type="button">刷新</button>
                <div id="sync-menu-pop" class="sync-menu-pop hidden">
                  <button id="request-sync-btn" class="ghost sync-item" type="button">服务端刷新</button>
                  <button id="manual-sync-btn" class="ghost sync-item" type="button">消息刷新</button>
                </div>
              </div>
            </div>
            <div class="helper" id="thread-meta">未选择线程</div>
          </div>
        </section>
      </div>
    </div>

    <div id="mobile-drawer-overlay" class="mobile-drawer-overlay hidden"></div>
    <aside id="mobile-drawer" class="mobile-drawer hidden">
      <div class="mobile-drawer-head">
        <strong>导航</strong>
        <div class="mobile-drawer-actions">
          <button id="theme-toggle" class="theme-toggle" type="button" aria-label="切换主题">☾</button>
          <button id="mobile-drawer-close" class="mobile-drawer-close" type="button" aria-label="关闭菜单">×</button>
        </div>
      </div>
      <div class="mobile-drawer-path">
        <button id="mobile-path-projects" class="mobile-path-btn" type="button">项目</button>
        <span class="mobile-path-sep">/</span>
        <span id="mobile-path-current" class="mobile-path-current">线程</span>
      </div>
      <div id="mobile-project-section" class="mobile-nav-section">
        <div class="panel-title">选择项目</div>
        <ul id="mobile-project-list" class="list"></ul>
      </div>
      <div id="mobile-thread-section" class="mobile-nav-section hidden">
        <div id="mobile-thread-title" class="panel-title">选择线程</div>
        <ul id="mobile-thread-list" class="list"></ul>
      </div>
    </aside>

    <div id="download-dock" class="download-dock collapsed">
      <button id="download-toggle" class="download-toggle" type="button">本地端</button>
      <div class="download-panel">
        <button id="download-close" class="download-close" type="button" aria-label="关闭">×</button>
        <div style="font-weight:700;margin-bottom:6px">本地控制端</div>
        <div class="helper">下载并在办公室电脑运行本地 Agent。</div>
        <div class="control-row" style="margin-top:8px;margin-bottom:0">
          <a id="download-link" href="#" target="_blank" rel="noreferrer">下载</a>
          <a id="tutorial-link" href="#" target="_blank" rel="noreferrer">教程</a>
        </div>
      </div>
    </div>

    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

export const APP_CSS = `
:root {
  --bg: #0e1116;
  --bg-elev: #131822;
  --bg-elev-2: #181f2b;
  --line: #2a3242;
  --text: #e7ebf3;
  --muted: #9aa5b5;
  --accent: #8aa4ff;
  --accent-soft: #27365a;
  --user-bg: #2a3758;
  --assistant-bg: #1a2233;
  --system-bg: #222731;
  --shadow: rgba(0, 0, 0, 0.28);
  --mobile-topbar-space: 0px;
}

body.theme-light {
  --bg: #f2f4f8;
  --bg-elev: #ffffff;
  --bg-elev-2: #f8f9fc;
  --line: #d7dce7;
  --text: #202633;
  --muted: #5f6b7d;
  --accent: #4d64b8;
  --accent-soft: #e5eaf9;
  --user-bg: #dce5ff;
  --assistant-bg: #edf1f8;
  --system-bg: #e8edf6;
  --shadow: rgba(35, 45, 68, 0.08);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  height: 100vh;
  overflow: hidden;
  overscroll-behavior-y: none;
  color: var(--text);
  background: var(--bg);
  font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
}

a {
  color: var(--accent);
}

.shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  padding-top: max(10px, calc(env(safe-area-inset-top) + 6px));
  border-bottom: 1px solid var(--line);
  background: var(--bg-elev);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.badge {
  font-family: "IBM Plex Mono", "Menlo", monospace;
  color: var(--muted);
  font-size: 12px;
}

.topbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mobile-topbar-meta {
  display: none;
}

.layout {
  display: grid;
  grid-template-columns: 280px 320px 1fr;
  flex: 1;
  min-height: 0;
}

.panel {
  border-right: 1px solid var(--line);
  background: var(--bg-elev);
  overflow: auto;
  min-height: 0;
}

.panel-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-elev-2);
  border-bottom: 1px solid var(--line);
  padding: 10px;
}

.panel-title {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.list {
  margin: 0;
  padding: 10px;
  list-style: none;
}

.item {
  border: 1px solid transparent;
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
  background: var(--bg-elev-2);
}

.item:hover {
  border-color: color-mix(in srgb, var(--accent), var(--line) 35%);
}

.item.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft), var(--bg-elev-2) 60%);
}

.item-title {
  font-weight: 700;
  font-size: 14px;
}

.item-meta {
  color: var(--muted);
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 12px;
  margin-top: 4px;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--bg-elev);
}

.messages {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.msg {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: min(78%, 900px);
  background: var(--assistant-bg);
  align-self: flex-start;
  box-shadow: 0 2px 8px var(--shadow);
}

.msg.user {
  background: var(--user-bg);
  align-self: flex-end;
}

.msg.assistant {
  background: var(--assistant-bg);
  align-self: flex-start;
}

.msg.system,
.msg.developer {
  background: var(--system-bg);
  align-self: center;
  max-width: min(92%, 980px);
}

.msg.pending {
  border-style: dashed;
}

.msg.pending-queued {
  opacity: 0.88;
}

.msg.pending-running {
  opacity: 0.96;
}

.msg-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-family: "IBM Plex Mono", "Menlo", monospace;
  color: var(--muted);
  margin-bottom: 6px;
}

.msg-body {
  display: grid;
  gap: 10px;
}

.msg-body > * {
  margin: 0;
}

.msg-body p,
.msg-body ul,
.msg-body ol,
.msg-body blockquote,
.msg-body h1,
.msg-body h2,
.msg-body h3,
.msg-body h4 {
  margin: 0;
}

.msg-body ul,
.msg-body ol {
  padding-left: 20px;
}

.msg-body li + li {
  margin-top: 4px;
}

.msg-body a {
  color: var(--accent);
  text-decoration: underline;
}

.msg-body code {
  padding: 1px 6px;
  border-radius: 6px;
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 0.92em;
  background: color-mix(in srgb, var(--bg), var(--line) 42%);
}

.msg-body blockquote {
  padding-left: 12px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}

.code-block {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg), #000 10%);
}

.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg-elev-2), #000 12%);
}

.code-lang {
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 12px;
  color: var(--muted);
  text-transform: lowercase;
}

.code-copy-btn {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 8px;
  color: var(--text);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.code-copy-btn:hover {
  border-color: var(--accent);
}

.code-block pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.code-block pre code {
  padding: 0;
  border-radius: 0;
  background: transparent;
}

.controls {
  border-top: 1px solid var(--line);
  padding: 12px;
  background: var(--bg-elev-2);
}

.latest-jump-btn {
  position: absolute;
  right: 12px;
  bottom: 112px;
  z-index: 12;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--bg-elev), #000 12%);
  box-shadow: 0 10px 24px var(--shadow);
  font: inherit;
  cursor: pointer;
}

.latest-jump-btn.hidden {
  display: none;
}

.branch-row {
  margin-bottom: 8px;
}

.action-row button {
  white-space: nowrap;
}

.action-row #send-btn {
  flex: 1;
}

.sync-menu-wrap {
  position: relative;
}

.sync-menu-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  width: 148px;
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  box-shadow: 0 10px 24px var(--shadow);
  z-index: 15;
}

.sync-item {
  width: 100%;
  text-align: left;
}

.control-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

input,
textarea,
button,
select {
  font: inherit;
  color: var(--text);
  background: var(--bg-elev);
  border: 1px solid var(--line);
  border-radius: 10px;
}

input,
select {
  height: 38px;
  padding: 8px 10px;
}

textarea {
  width: 100%;
  padding: 10px;
  min-height: 92px;
  resize: vertical;
}

button {
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  color: #0f1220;
  border-color: transparent;
}

button.ghost {
  background: var(--bg-elev);
}

.helper {
  font-size: 12px;
  color: var(--muted);
}

.status {
  font-family: "IBM Plex Mono", "Menlo", monospace;
  color: var(--muted);
  font-size: 12px;
}

.quota-wrap {
  min-width: 200px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg-elev-2);
}

.quota-head {
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
}

.quota-bars {
  display: grid;
  gap: 5px;
}

.quota-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line), transparent 35%);
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: linear-gradient(90deg, #77a7ff, #9fc3ff);
  transition: width 200ms ease;
}

.quota-bar:nth-child(2) .quota-fill {
  background: linear-gradient(90deg, #a77fff, #c1a3ff);
}

.modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(8, 11, 17, 0.65);
  backdrop-filter: blur(4px);
  z-index: 50;
}

.modal-card {
  width: min(520px, calc(100vw - 24px));
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--bg-elev);
}

.hidden {
  display: none !important;
}

.download-dock {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 60;
}

.download-toggle {
  border-radius: 999px;
  padding: 9px 14px;
  background: var(--bg-elev-2);
}

.download-panel {
  position: absolute;
  left: 0;
  bottom: 48px;
  width: 250px;
  padding: 14px 12px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg-elev);
  box-shadow: 0 12px 30px var(--shadow);
}

.download-dock.collapsed .download-panel {
  display: none;
}

.theme-toggle {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 16px;
  line-height: 1;
  background: var(--bg-elev-2);
}

.download-close {
  position: absolute;
  right: 6px;
  top: 4px;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 1;
}

.mobile-menu-toggle {
  display: none;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.mobile-drawer-overlay,
.mobile-drawer {
  display: none;
}

.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(5, 8, 13, 0.55);
}

.mobile-drawer {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: min(86vw, 380px);
  z-index: 71;
  background: var(--bg-elev);
  border-right: 1px solid var(--line);
  overflow: auto;
}

.mobile-drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.mobile-drawer-path {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}

.mobile-path-btn {
  border: none;
  background: transparent;
  color: var(--accent);
  padding: 0;
  font-size: 12px;
  font-weight: 700;
}

.mobile-path-btn[disabled] {
  color: var(--muted);
  cursor: default;
}

.mobile-path-sep,
.mobile-path-current {
  font-size: 12px;
  color: var(--muted);
}

.mobile-drawer-close {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  font-size: 18px;
}

.mobile-nav-section {
  padding: 10px;
}

@media (max-width: 1280px) and (min-width: 901px) {
  .layout {
    grid-template-columns: 220px 260px minmax(0, 1fr);
  }

  .brand {
    font-size: 15px;
  }

  .quota-wrap {
    min-width: 164px;
  }
}

@media (max-width: 900px) {
  body {
    --mobile-topbar-space: calc(46px + env(safe-area-inset-top));
  }

  body.mobile-topbar-hidden {
    --mobile-topbar-space: 0px;
  }

  body {
    height: 100vh;
    overflow: hidden;
    font-size: 14px;
  }

  .shell {
    height: 100vh;
  }

  .layout {
    grid-template-columns: 1fr;
    min-height: 0;
    padding-top: var(--mobile-topbar-space);
    transition: padding-top 180ms ease;
  }

  .nav-panel {
    display: none;
  }

  .main {
    min-height: 0;
  }

  .topbar {
    padding: calc(env(safe-area-inset-top) + 6px) 8px 6px 8px;
    min-height: calc(46px + env(safe-area-inset-top));
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    z-index: 44;
    transition: transform 180ms ease, opacity 180ms ease;
  }

  .topbar.topbar-hidden {
    transform: translateY(-120%);
    opacity: 0;
    pointer-events: none;
  }

  .topbar-right {
    display: none;
  }

  .topbar-left > div {
    display: none;
  }

  .topbar-left {
    gap: 0;
  }

  .mobile-topbar-meta {
    display: block;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    font-family: "IBM Plex Mono", "Menlo", monospace;
    font-size: 11px;
    line-height: 1.25;
    color: var(--muted);
  }

  .msg {
    max-width: 92%;
  }

  .item-title {
    font-size: 13px;
  }

  .item-meta {
    font-size: 11px;
  }

  .messages {
    padding: 10px;
  }

  .latest-jump-btn {
    right: 10px;
    bottom: 92px;
    max-width: calc(100vw - 20px);
    padding: 8px 10px;
    font-size: 12px;
  }

  .controls {
    padding: 8px;
  }

  .branch-row {
    display: none;
  }

  textarea {
    min-height: 62px;
    max-height: 132px;
  }

  .control-row {
    gap: 6px;
    margin-bottom: 6px;
  }

  input,
  textarea,
  button,
  select {
    font-size: 13px;
  }

  .action-row button {
    padding: 7px 8px;
    font-size: 12px;
  }

  .sync-menu-pop {
    width: 156px;
  }

  #thread-meta {
    display: none;
  }

  .mobile-menu-toggle,
  .mobile-drawer-overlay,
  .mobile-drawer {
    display: block;
  }

  .mobile-menu-toggle {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .download-dock {
    display: none;
  }
}
`;

export const APP_JS = String.raw`
const state = {
  agentId: "",
  masterKey: "",
  viewerProof: "",
  snapshot: null,
  agentPresence: null,
  kvUsage: null,
  selectedProjectId: "",
  selectedThreadId: "",
  pendingMessages: {},
  mobileLastScrollTop: 0,
  mobileTopbarVisible: true,
  stickToLatest: true,
  unseenMessageCount: 0,
  lastRenderedThreadId: "",
  lastRenderedMessageCount: 0,
  waitState: null,
  waitPollTimer: null,
  mobileNavMode: "projects",
  theme: "dark",
  sendInFlight: false,
};

const ui = {
  topbar: document.querySelector(".topbar"),
  unlockModal: document.getElementById("unlock-modal"),
  unlockForm: document.getElementById("unlock-form"),
  unlockReset: document.getElementById("unlock-reset"),
  unlockError: document.getElementById("unlock-error"),
  agentIdInput: document.getElementById("agent-id"),
  masterKeyInput: document.getElementById("master-key"),
  agentBadge: document.getElementById("agent-badge"),
  mobileTopbarMeta: document.getElementById("mobile-topbar-meta"),
  statusText: document.getElementById("status-text"),
  quotaText: document.getElementById("quota-text"),
  quotaPrimaryFill: document.getElementById("quota-primary-fill"),
  quotaSecondaryFill: document.getElementById("quota-secondary-fill"),
  projectCount: document.getElementById("project-count"),
  projectList: document.getElementById("project-list"),
  threadList: document.getElementById("thread-list"),
  messages: document.getElementById("messages"),
  latestJumpBtn: document.getElementById("latest-jump-btn"),
  threadMeta: document.getElementById("thread-meta"),
  promptInput: document.getElementById("prompt-input"),
  sendBtn: document.getElementById("send-btn"),
  syncMenuWrap: document.getElementById("sync-menu-wrap"),
  syncMenuBtn: document.getElementById("sync-menu-btn"),
  syncMenuPop: document.getElementById("sync-menu-pop"),
  manualSyncBtn: document.getElementById("manual-sync-btn"),
  requestSyncBtn: document.getElementById("request-sync-btn"),
  newThreadBtn: document.getElementById("new-thread-btn"),
  branchSelect: document.getElementById("branch-select"),
  switchBranchBtn: document.getElementById("switch-branch-btn"),
  mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
  mobileDrawer: document.getElementById("mobile-drawer"),
  mobileDrawerOverlay: document.getElementById("mobile-drawer-overlay"),
  mobileDrawerClose: document.getElementById("mobile-drawer-close"),
  mobilePathProjects: document.getElementById("mobile-path-projects"),
  mobilePathSep: document.querySelector(".mobile-path-sep"),
  mobilePathCurrent: document.getElementById("mobile-path-current"),
  mobileProjectSection: document.getElementById("mobile-project-section"),
  mobileThreadSection: document.getElementById("mobile-thread-section"),
  mobileThreadTitle: document.getElementById("mobile-thread-title"),
  mobileProjectList: document.getElementById("mobile-project-list"),
  mobileThreadList: document.getElementById("mobile-thread-list"),
  downloadLink: document.getElementById("download-link"),
  tutorialLink: document.getElementById("tutorial-link"),
  downloadDock: document.getElementById("download-dock"),
  downloadToggle: document.getElementById("download-toggle"),
  downloadClose: document.getElementById("download-close"),
  themeToggle: document.getElementById("theme-toggle"),
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function setStatus(message) {
  ui.statusText.textContent = message;
}

function renderAgentBadge() {
  if (!state.agentId) {
    ui.agentBadge.textContent = "未连接";
    return;
  }

  const presence = state.agentPresence;
  if (!presence) {
    ui.agentBadge.textContent = "Agent: " + state.agentId + " · 状态未知";
    return;
  }

  const flag = presence.online ? "在线" : "离线";
  ui.agentBadge.textContent = "Agent: " + state.agentId + " · " + flag;
}

function compactCount(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value >= 1000000) {
    return String(Math.round(value / 100000) / 10) + "m";
  }
  if (value >= 1000) {
    return String(Math.round(value / 100) / 10) + "k";
  }
  return String(value);
}

function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMobileTopbarMeta() {
  if (!ui.mobileTopbarMeta) {
    return;
  }

  const presence = state.agentPresence;
  const onlineText = presence ? (presence.online ? "在线" : "离线") : "未连接";
  const refreshText = formatClock(
    presence && presence.snapshotUpdatedAt
      ? presence.snapshotUpdatedAt
      : (state.snapshot ? state.snapshot.generatedAt : ""),
  );

  if (!state.kvUsage || !state.kvUsage.limits) {
    ui.mobileTopbarMeta.textContent = onlineText + " · " + refreshText + " · KV --";
    return;
  }

  const usage = state.kvUsage;
  const readRemain = Math.max(0, usage.limits.readsPerDay - usage.reads);
  const writeRemain = Math.max(0, usage.limits.writesPerDay - usage.writes);
  ui.mobileTopbarMeta.textContent = onlineText
    + " · "
    + refreshText
    + " · KV R"
    + compactCount(readRemain)
    + " W"
    + compactCount(writeRemain);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 310000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJson(passphrase, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptJson(passphrase, envelope) {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(decrypted));
}

async function computeViewerProof(agentId, passphrase) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(agentId + ":" + passphrase));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function request(path, options, includeViewerAuth) {
  const opts = options || {};
  const headers = new Headers(opts.headers || {});
  headers.set("content-type", "application/json");
  if (includeViewerAuth) {
    headers.set("x-viewer-proof", state.viewerProof);
  }
  const response = await fetch(path, {
    ...opts,
    headers,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = (body && body.error) ? body.error : ("Request failed (" + response.status + ")");
    throw new Error(message);
  }
  return body;
}

function clearMessages(message) {
  ui.messages.innerHTML = "";
  const box = document.createElement("div");
  box.className = "msg system";
  box.textContent = message;
  ui.messages.appendChild(box);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

function truncate(text, max) {
  const cap = max || 90;
  if (!text) {
    return "";
  }
  if (text.length <= cap) {
    return text;
  }
  return text.slice(0, cap - 1) + "…";
}

function normalizeComparableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\x60/g, "&#96;");
}

function sanitizeLinkUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw, window.location.origin);
    const protocol = url.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
}

function renderInlineMarkdown(text) {
  const segments = String(text || "").split(/(\x60[^\x60]+\x60)/g);
  return segments.map((segment) => {
    if (/^\x60[^\x60]+\x60$/.test(segment)) {
      return "<code>" + escapeHtml(segment.slice(1, -1)) + "</code>";
    }

    let html = escapeHtml(segment);
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      const safeHref = sanitizeLinkUrl(href);
      if (!safeHref) {
        return escapeHtml(label);
      }
      return "<a href=\"" + escapeAttribute(safeHref) + "\" target=\"_blank\" rel=\"noreferrer\">"
        + escapeHtml(label)
        + "</a>";
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
    return html;
  }).join("");
}

function buildMarkdownBlocks(text) {
  const blocks = [];
  const source = String(text || "").replace(/\r\n/g, "\n");
  const fencePattern = /\x60\x60\x60([a-zA-Z0-9_+-]*)\n?([\s\S]*?)\x60\x60\x60/g;
  let lastIndex = 0;
  let match;

  while ((match = fencePattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "markdown", text: source.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: "code",
      language: (match[1] || "").trim(),
      code: String(match[2] || "").replace(/\n$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    blocks.push({ type: "markdown", text: source.slice(lastIndex) });
  }

  if (blocks.length === 0) {
    blocks.push({ type: "markdown", text: source });
  }

  return blocks;
}

function appendMarkdownText(container, text) {
  const lines = String(text || "").replace(/^\n+|\n+$/g, "").split("\n");
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let quoteLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    const node = document.createElement("p");
    node.innerHTML = paragraph.map((line) => renderInlineMarkdown(line)).join("<br>");
    container.appendChild(node);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    const list = document.createElement(listType === "ol" ? "ol" : "ul");
    for (const itemText of listItems) {
      const item = document.createElement("li");
      item.innerHTML = renderInlineMarkdown(itemText);
      list.appendChild(item);
    }
    container.appendChild(list);
    listItems = [];
    listType = "";
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }
    const quote = document.createElement("blockquote");
    quote.innerHTML = quoteLines.map((line) => renderInlineMarkdown(line)).join("<br>");
    container.appendChild(quote);
    quoteLines = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "    ");
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushAll();
      const level = Math.min(headingMatch[1].length, 4);
      const heading = document.createElement("h" + String(level));
      heading.innerHTML = renderInlineMarkdown(headingMatch[2]);
      container.appendChild(heading);
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unorderedMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushAll();
}

async function copyTextToClipboard(text, button) {
  const label = button.textContent || "复制";
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "已复制";
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  } catch {
    button.textContent = "复制失败";
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  }
}

function renderMessageContent(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg-body";

  for (const block of buildMarkdownBlocks(text)) {
    if (block.type === "code") {
      const codeWrap = document.createElement("div");
      codeWrap.className = "code-block";

      const codeHead = document.createElement("div");
      codeHead.className = "code-head";

      const codeLang = document.createElement("span");
      codeLang.className = "code-lang";
      codeLang.textContent = block.language || "code";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-copy-btn";
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", () => {
        copyTextToClipboard(block.code, copyBtn);
      });

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.code;
      pre.appendChild(code);

      codeHead.appendChild(codeLang);
      codeHead.appendChild(copyBtn);
      codeWrap.appendChild(codeHead);
      codeWrap.appendChild(pre);
      wrapper.appendChild(codeWrap);
      continue;
    }

    if (String(block.text || "").trim()) {
      appendMarkdownText(wrapper, block.text);
    }
  }

  if (wrapper.childNodes.length === 0) {
    const fallback = document.createElement("p");
    fallback.textContent = "";
    wrapper.appendChild(fallback);
  }

  return wrapper;
}

function isMobileView() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function openMobileDrawer() {
  setMobileNavMode("projects");
  ui.mobileDrawer.classList.remove("hidden");
  ui.mobileDrawerOverlay.classList.remove("hidden");
}

function closeMobileDrawer() {
  ui.mobileDrawer.classList.add("hidden");
  ui.mobileDrawerOverlay.classList.add("hidden");
}

function setMobileTopbarVisible(visible) {
  state.mobileTopbarVisible = visible;
  document.body.classList.toggle("mobile-topbar-hidden", isMobileView() && !visible);
  if (!ui.topbar || !isMobileView()) {
    return;
  }
  ui.topbar.classList.toggle("topbar-hidden", !visible);
}

function setMobileNavMode(mode) {
  const nextMode = mode === "threads" ? "threads" : "projects";
  state.mobileNavMode = nextMode;
  const project = getSelectedProject();

  const inThreadMode = nextMode === "threads";
  if (ui.mobileProjectSection) {
    ui.mobileProjectSection.classList.toggle("hidden", inThreadMode);
  }
  if (ui.mobileThreadSection) {
    ui.mobileThreadSection.classList.toggle("hidden", !inThreadMode);
  }
  if (ui.mobilePathProjects) {
    ui.mobilePathProjects.disabled = !inThreadMode;
  }
  if (ui.mobilePathSep) {
    ui.mobilePathSep.classList.toggle("hidden", !inThreadMode);
  }
  if (ui.mobilePathCurrent) {
    ui.mobilePathCurrent.classList.toggle("hidden", !inThreadMode);
    ui.mobilePathCurrent.textContent = inThreadMode && project ? truncate(project.name, 16) : "线程";
  }
  if (ui.mobileThreadTitle) {
    ui.mobileThreadTitle.textContent = inThreadMode && project
      ? ("选择线程 · " + truncate(project.name, 20))
      : "选择线程";
  }
}

function scrollMessagesToBottom() {
  const apply = () => {
    ui.messages.scrollTop = ui.messages.scrollHeight;
  };

  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
    });
  });
  setTimeout(() => {
    apply();
  }, 120);
}

function isNearLatest(threshold) {
  const gap = ui.messages.scrollHeight - ui.messages.clientHeight - ui.messages.scrollTop;
  return gap <= (threshold || 48);
}

function renderLatestJumpButton() {
  if (!ui.latestJumpBtn) {
    return;
  }

  if (state.stickToLatest || state.unseenMessageCount <= 0) {
    ui.latestJumpBtn.classList.add("hidden");
    ui.latestJumpBtn.textContent = "↓ 回到最新";
    return;
  }

  const count = state.unseenMessageCount;
  ui.latestJumpBtn.classList.remove("hidden");
  ui.latestJumpBtn.textContent = count > 1 ? ("↓ " + String(count) + " 条新消息") : "↓ 1 条新消息";
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("theme-light", state.theme === "light");
  if (ui.themeToggle) {
    ui.themeToggle.textContent = state.theme === "light" ? "☾" : "☼";
  }
  localStorage.setItem("remote-vibe-theme", state.theme);
}

function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

function handleMessagesScroll() {
  state.stickToLatest = isNearLatest();
  if (state.stickToLatest) {
    state.unseenMessageCount = 0;
    renderLatestJumpButton();
  }

  if (!isMobileView()) {
    return;
  }

  const current = ui.messages.scrollTop;
  if (current <= 6) {
    setMobileTopbarVisible(true);
    state.mobileLastScrollTop = current;
    return;
  }

  if (current > state.mobileLastScrollTop + 4) {
    setMobileTopbarVisible(false);
  } else if (current < state.mobileLastScrollTop - 4) {
    setMobileTopbarVisible(true);
  }
  state.mobileLastScrollTop = current;
}

function isSyncMenuOpen() {
  return !ui.syncMenuPop.classList.contains("hidden");
}

function closeSyncMenu() {
  ui.syncMenuPop.classList.add("hidden");
}

function toggleSyncMenu() {
  if (isSyncMenuOpen()) {
    closeSyncMenu();
  } else {
    ui.syncMenuPop.classList.remove("hidden");
  }
}

function getSelectedProject() {
  if (!state.snapshot) {
    return null;
  }
  return state.snapshot.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function getSelectedThread() {
  if (!state.snapshot || !state.selectedThreadId) {
    return null;
  }
  return state.snapshot.threads[state.selectedThreadId] || null;
}

function getPendingMessages(threadId) {
  return state.pendingMessages[threadId] || [];
}

function countAssistantMessages(thread) {
  if (!thread || !thread.messages) {
    return 0;
  }
  return thread.messages.filter((message) => message.role === "assistant").length;
}

function pushPendingMessage(thread, text) {
  const list = state.pendingMessages[thread.id] || [];
  const entry = {
    id: "pending-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
    role: "user",
    text,
    timestamp: new Date().toISOString(),
    pending: true,
    pendingState: "queued",
    baselineCount: thread.messageCount,
  };
  list.push(entry);
  state.pendingMessages[thread.id] = list;
  return entry.id;
}

function updatePendingMessageState(threadId, pendingId, nextState) {
  const list = state.pendingMessages[threadId] || [];
  const item = list.find((entry) => entry.id === pendingId);
  if (!item) {
    return;
  }
  item.pendingState = nextState;
}

function reconcilePending(snapshot) {
  const nextPending = {};

  for (const threadId of Object.keys(state.pendingMessages)) {
    const currentPending = state.pendingMessages[threadId];
    const thread = snapshot.threads[threadId];

    if (!thread) {
      nextPending[threadId] = currentPending;
      continue;
    }

    const remaining = [];
    for (const pending of currentPending) {
      const hasSameUserMessage = thread.messages.some((message) => {
        return message.role === "user"
          && normalizeComparableText(message.text) === normalizeComparableText(pending.text);
      });

      if (!hasSameUserMessage) {
        remaining.push(pending);
      }
    }

    if (remaining.length > 0) {
      nextPending[threadId] = remaining;
    }
  }

  state.pendingMessages = nextPending;
}

function dedupeMessagesForDisplay(messages) {
  const result = [];

  for (const message of messages) {
    let duplicateIndex = -1;
    const currentText = normalizeComparableText(message.text);

    for (let i = result.length - 1; i >= 0 && i >= result.length - 12; i -= 1) {
      const prev = result[i];
      const sameRole = prev.role === message.role;
      const sameText = normalizeComparableText(prev.text) === currentText;
      if (!sameRole || !sameText) {
        continue;
      }

      const prevMs = Date.parse(prev.timestamp);
      const curMs = Date.parse(message.timestamp);
      const closeEnough = Number.isFinite(prevMs) && Number.isFinite(curMs)
        ? Math.abs(curMs - prevMs) <= 20_000
        : true;

      if (closeEnough) {
        duplicateIndex = i;
        break;
      }
    }

    if (duplicateIndex === -1) {
      result.push(message);
      continue;
    }

    const existing = result[duplicateIndex];
    if (existing.pending && !message.pending) {
      result[duplicateIndex] = message;
    }
  }

  return result;
}

function formatPendingRoleLabel(message) {
  if (!message.pending) {
    return message.role;
  }
  if (message.pendingState === "running") {
    return message.role + " (已接收)";
  }
  return message.role + " (已提交)";
}

function applyResponsiveLabels() {
  if (isMobileView()) {
    ui.sendBtn.textContent = "发送";
    ui.requestSyncBtn.textContent = "服务端刷新";
    ui.manualSyncBtn.textContent = "消息刷新";
    ui.syncMenuBtn.textContent = "刷新";
    return;
  }

  ui.sendBtn.textContent = "发送到线程";
  ui.requestSyncBtn.textContent = "服务端刷新";
  ui.manualSyncBtn.textContent = "消息刷新";
  ui.syncMenuBtn.textContent = "刷新";
}

function renderQuotaAndState() {
  const usage = state.kvUsage;
  if (!usage || !usage.limits) {
    ui.quotaText.textContent = "KV: --";
    ui.quotaPrimaryFill.style.width = "0%";
    ui.quotaSecondaryFill.style.width = "0%";
    return;
  }

  const readRemain = Math.max(0, usage.limits.readsPerDay - usage.reads);
  const writeRemain = Math.max(0, usage.limits.writesPerDay - usage.writes);
  const deleteRemain = Math.max(0, usage.limits.deletesPerDay - usage.deletes);
  const listRemain = Math.max(0, usage.limits.listsPerDay - usage.lists);
  ui.quotaText.textContent = "KV R:" + readRemain + " W:" + writeRemain + " D:" + deleteRemain + " L:" + listRemain;

  const readWidth = usage.limits.readsPerDay > 0
    ? Math.max(0, Math.min(100, (readRemain / usage.limits.readsPerDay) * 100))
    : 0;
  const writeWidth = usage.limits.writesPerDay > 0
    ? Math.max(0, Math.min(100, (writeRemain / usage.limits.writesPerDay) * 100))
    : 0;
  ui.quotaPrimaryFill.style.width = String(readWidth) + "%";
  ui.quotaSecondaryFill.style.width = String(writeWidth) + "%";
}

function renderProjects() {
  const projects = state.snapshot ? state.snapshot.projects : [];
  ui.projectCount.textContent = String(projects.length) + " 项目";
  ui.projectList.innerHTML = "";
  ui.mobileProjectList.innerHTML = "";

  if (!state.selectedProjectId && projects.length > 0) {
    state.selectedProjectId = projects[0].id;
  }

  if (state.selectedProjectId && !projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = projects.length > 0 ? projects[0].id : "";
    state.selectedThreadId = "";
  }

  for (const project of projects) {
    const branchText = project.currentBranch ? ("分支: " + project.currentBranch) : "非 Git 项目";
    const itemHtml = "<div class=\"item-title\">" + project.name + "</div>"
      + "<div class=\"item-meta\">" + project.cwd + "</div>"
      + "<div class=\"item-meta\">" + branchText + "</div>"
      + "<div class=\"item-meta\">" + String(project.threadIds.length) + " threads</div>";

    const desktopItem = document.createElement("li");
    desktopItem.className = "item" + (project.id === state.selectedProjectId ? " active" : "");
    desktopItem.innerHTML = itemHtml;
    desktopItem.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      state.selectedThreadId = project.threadIds[0] || "";
      renderAll();
    });
    ui.projectList.appendChild(desktopItem);

    const mobileItem = document.createElement("li");
    mobileItem.className = "item" + (project.id === state.selectedProjectId ? " active" : "");
    mobileItem.innerHTML = itemHtml;
    mobileItem.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      state.selectedThreadId = "";
      renderAll();
      setMobileNavMode("threads");
      setStatus("项目已切换，请选择线程");
    });
    ui.mobileProjectList.appendChild(mobileItem);
  }
}

function renderThreads() {
  const snapshot = state.snapshot;
  ui.threadList.innerHTML = "";
  ui.mobileThreadList.innerHTML = "";

  if (!snapshot) {
    return;
  }

  const project = getSelectedProject();
  if (!project) {
    return;
  }

  if (!isMobileView() && !state.selectedThreadId && project.threadIds.length > 0) {
    state.selectedThreadId = project.threadIds[0];
  }

  for (const threadId of project.threadIds) {
    const thread = snapshot.threads[threadId];
    if (!thread) {
      continue;
    }
    const itemHtml = "<div class=\"item-title\">" + thread.title + "</div>"
      + "<div class=\"item-meta\">" + formatTime(thread.updatedAt) + "</div>"
      + "<div class=\"item-meta\">" + truncate(thread.lastMessagePreview, 80) + "</div>";

    const desktopItem = document.createElement("li");
    desktopItem.className = "item" + (thread.id === state.selectedThreadId ? " active" : "");
    desktopItem.innerHTML = itemHtml;
    desktopItem.addEventListener("click", () => {
      state.selectedThreadId = thread.id;
      state.stickToLatest = true;
      renderMessages();
      renderThreads();
    });
    ui.threadList.appendChild(desktopItem);

    const mobileItem = document.createElement("li");
    mobileItem.className = "item" + (thread.id === state.selectedThreadId ? " active" : "");
    mobileItem.innerHTML = itemHtml;
    mobileItem.addEventListener("click", () => {
      state.selectedThreadId = thread.id;
      state.stickToLatest = true;
      closeMobileDrawer();
      renderMessages();
      renderThreads();
      setStatus("线程已切换");
    });
    ui.mobileThreadList.appendChild(mobileItem);
  }
}

function renderBranchControls() {
  const project = getSelectedProject();
  ui.branchSelect.innerHTML = "";

  if (!project || !project.branches || project.branches.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "当前项目无可用分支";
    ui.branchSelect.appendChild(option);
    ui.branchSelect.disabled = true;
    ui.switchBranchBtn.disabled = true;
    return;
  }

  for (const branch of project.branches) {
    const option = document.createElement("option");
    option.value = branch;
    option.textContent = branch;
    ui.branchSelect.appendChild(option);
  }

  ui.branchSelect.value = project.currentBranch || project.branches[0];
  ui.branchSelect.disabled = false;
  ui.switchBranchBtn.disabled = false;
}

function renderMessages() {
  const thread = getSelectedThread();
  if (!thread) {
    clearMessages(isMobileView() ? "请从左上角菜单先选择项目，再选择线程。" : "选择线程后可查看消息并交互。");
    ui.threadMeta.textContent = "未选择线程";
    state.lastRenderedThreadId = "";
    state.lastRenderedMessageCount = 0;
    state.unseenMessageCount = 0;
    state.stickToLatest = true;
    renderLatestJumpButton();
    return;
  }

  const previousThreadId = state.lastRenderedThreadId;
  const previousMessageCount = state.lastRenderedMessageCount;
  const previousScrollTop = ui.messages.scrollTop;
  const previousNearLatest = isNearLatest();
  const threadChanged = previousThreadId !== thread.id;

  ui.messages.innerHTML = "";
  if (isMobileView()) {
    ui.threadMeta.textContent = thread.title;
  } else {
    ui.threadMeta.textContent = thread.id + " | " + thread.cwd;
  }

  const combinedMessages = dedupeMessagesForDisplay(
    thread.messages.concat(getPendingMessages(thread.id)),
  );
  const currentMessageCount = combinedMessages.length;
  if (combinedMessages.length === 0) {
    clearMessages("该线程暂时没有可展示消息。");
    state.lastRenderedThreadId = thread.id;
    state.lastRenderedMessageCount = 0;
    state.unseenMessageCount = 0;
    state.stickToLatest = true;
    renderLatestJumpButton();
    return;
  }

  for (const message of combinedMessages) {
    const card = document.createElement("div");
    card.className = "msg " + message.role + (message.pending ? " pending" : "");
    if (message.pending && message.pendingState) {
      card.classList.add("pending-" + message.pendingState);
    }

    const head = document.createElement("div");
    head.className = "msg-head";
    const roleText = formatPendingRoleLabel(message);
    head.innerHTML = "<span>" + roleText + "</span><span>" + formatTime(message.timestamp) + "</span>";

    const content = renderMessageContent(message.text);

    card.appendChild(head);
    card.appendChild(content);
    ui.messages.appendChild(card);
  }

  const shouldAutoScroll = threadChanged || state.stickToLatest || previousNearLatest;
  const addedMessages = !threadChanged && currentMessageCount > previousMessageCount
    ? currentMessageCount - previousMessageCount
    : 0;

  state.lastRenderedThreadId = thread.id;
  state.lastRenderedMessageCount = currentMessageCount;

  if (shouldAutoScroll) {
    state.stickToLatest = true;
    state.unseenMessageCount = 0;
    scrollMessagesToBottom();
  } else {
    ui.messages.scrollTop = previousScrollTop;
    if (addedMessages > 0) {
      state.unseenMessageCount += addedMessages;
    }
  }

  renderLatestJumpButton();
}

function renderAll() {
  renderAgentBadge();
  applyResponsiveLabels();
  renderProjects();
  renderThreads();
  renderBranchControls();
  renderMessages();
  renderQuotaAndState();
  renderMobileTopbarMeta();
  if (isMobileView()) {
    setMobileNavMode(state.mobileNavMode);
    setMobileTopbarVisible(state.mobileTopbarVisible);
  } else if (ui.topbar) {
    ui.topbar.classList.remove("topbar-hidden");
    document.body.classList.remove("mobile-topbar-hidden");
  }
}

async function loadRemoteConfig() {
  try {
    const config = await request("/api/config", { method: "GET" }, false);
    if (config && config.downloadUrl) {
      ui.downloadLink.href = config.downloadUrl;
    }
    if (config && config.tutorialUrl) {
      ui.tutorialLink.href = config.tutorialUrl;
    }
  } catch (error) {
    console.error(error);
  }
}

async function fetchSnapshot(options) {
  if (!state.agentId || !state.viewerProof) {
    return;
  }

  const opts = options || {};
  if (!opts.silent) {
    setStatus("同步中...");
  }

  const payload = await request(
    "/api/view/snapshot?agentId=" + encodeURIComponent(state.agentId),
    { method: "GET" },
    true,
  );

  if (!payload.snapshotEnvelope) {
    state.snapshot = null;
    state.agentPresence = payload.agentPresence || null;
    state.kvUsage = null;
    clearMessages("本地 Agent 还未同步数据，请先启动本地控制端。\n\n启动命令: npm run dev:agent");
    renderAgentBadge();
    setStatus("等待本地 Agent 上传快照");
    return;
  }

  const snapshot = await decryptJson(state.masterKey, payload.snapshotEnvelope);
  state.snapshot = snapshot;
  state.agentPresence = payload.agentPresence || null;
  state.kvUsage = payload.kvUsage || null;
  reconcilePending(snapshot);

  if (!state.selectedProjectId && snapshot.projects.length > 0) {
    state.selectedProjectId = snapshot.projects[0].id;
  }

  const selectedProject = getSelectedProject();
  if (!selectedProject && snapshot.projects.length > 0) {
    state.selectedProjectId = snapshot.projects[0].id;
    state.selectedThreadId = "";
  }

  const projectAfterFallback = getSelectedProject();
  if (projectAfterFallback && projectAfterFallback.threadIds.length > 0) {
    if (!state.selectedThreadId || !projectAfterFallback.threadIds.includes(state.selectedThreadId)) {
      if (isMobileView()) {
        state.selectedThreadId = "";
      } else {
        state.selectedThreadId = projectAfterFallback.threadIds[0];
      }
    }
  } else {
    state.selectedThreadId = "";
  }

  if (!isMobileView() && !state.selectedThreadId && projectAfterFallback && projectAfterFallback.threadIds.length > 0) {
      state.selectedThreadId = projectAfterFallback.threadIds[0];
  }

  renderAll();
  if (!opts.silent) {
    setStatus("已同步: " + formatTime(snapshot.generatedAt));
  }
}

async function queueOperation(operation) {
  if (!state.masterKey || !state.agentId) {
    throw new Error("未解锁");
  }
  const opEnvelope = await encryptJson(state.masterKey, operation);
  const payload = await request(
    "/api/view/ops",
    {
      method: "POST",
      body: JSON.stringify({
        agentId: state.agentId,
        opEnvelope,
      }),
    },
    true,
  );
  return payload;
}

function stopAssistantPolling() {
  if (state.waitPollTimer) {
    clearTimeout(state.waitPollTimer);
    state.waitPollTimer = null;
  }
  state.waitState = null;
}

function startAssistantPolling(threadId, baselineAssistantCount) {
  stopAssistantPolling();
  state.waitState = {
    threadId,
    promptText: "",
    promptComparable: "",
    pendingId: "",
    baselineAssistantCount,
    phase: "queued",
    startedAt: Date.now(),
  };

  const tick = async () => {
    if (!state.waitState) {
      return;
    }

    try {
      await fetchSnapshot({ silent: true });
    } catch (error) {
      setStatus("自动刷新失败: " + error.message);
    }

    if (!state.waitState) {
      return;
    }

    const waitState = state.waitState;
    const thread = state.snapshot && state.snapshot.threads ? state.snapshot.threads[waitState.threadId] : null;
    const agentStatus = state.snapshot ? state.snapshot.agentStatus : null;
    const assistantCount = countAssistantMessages(thread);
    const isRunning = agentStatus && agentStatus.syncState === "running_command";
    const hasAccepted = thread
      ? thread.messages.some((message) => {
        return message.role === "user"
          && normalizeComparableText(message.text) === waitState.promptComparable;
      })
      : false;

    if (waitState.phase === "queued" && (hasAccepted || isRunning)) {
      waitState.phase = "running";
      if (waitState.pendingId) {
        updatePendingMessageState(waitState.threadId, waitState.pendingId, "running");
        renderMessages();
      }
      setStatus(isRunning ? "Agent 已接收，正在处理..." : "Agent 已接收，等待助手回复...");
    }

    if (thread && assistantCount > waitState.baselineAssistantCount && !isRunning) {
      stopAssistantPolling();
      setStatus("助手回复完成");
      return;
    }

    if (Date.now() - waitState.startedAt > 15 * 60 * 1000) {
      stopAssistantPolling();
      setStatus("等待超时，可点手动同步继续查看");
      return;
    }

    state.waitPollTimer = setTimeout(tick, 1000);
  };

  setStatus("消息已提交，等待 Agent 接收...");
  state.waitPollTimer = setTimeout(tick, 1000);
}

async function waitForBranchChange(projectId, targetBranch) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    await fetchSnapshot({ silent: true });
    const project = state.snapshot ? state.snapshot.projects.find((item) => item.id === projectId) : null;
    if (project && project.currentBranch === targetBranch) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function handleUnlock(event) {
  event.preventDefault();
  const agentId = String(ui.agentIdInput.value || "").trim();
  const masterKey = String(ui.masterKeyInput.value || "").trim();

  if (!agentId || !masterKey) {
    ui.unlockError.textContent = "Agent ID 和主密钥都不能为空";
    return;
  }

  ui.unlockError.textContent = "";
  setStatus("验证密码...");

  try {
    state.agentId = agentId;
    state.masterKey = masterKey;
    state.viewerProof = await computeViewerProof(agentId, masterKey);

    await fetchSnapshot();
    ui.unlockModal.classList.add("hidden");
    renderAgentBadge();
    localStorage.setItem("remote-vibe-agent-id", agentId);
    if (isMobileView()) {
      openMobileDrawer();
    }
  } catch (error) {
    state.agentId = "";
    state.masterKey = "";
    state.viewerProof = "";
    state.agentPresence = null;
    renderAgentBadge();
    ui.unlockError.textContent = "解锁失败: " + error.message;
    setStatus("解锁失败");
  }
}

async function handleSend() {
  const thread = getSelectedThread();
  if (!thread) {
    setStatus("先选择线程");
    return;
  }

  if (state.sendInFlight) {
    setStatus("上一条发送请求还在提交中");
    return;
  }

  const prompt = String(ui.promptInput.value || "").trim();
  if (!prompt) {
    setStatus("消息不能为空");
    return;
  }

  const baselineAssistantCount = countAssistantMessages(thread);
  state.sendInFlight = true;
  ui.sendBtn.disabled = true;

  try {
    await queueOperation({
      type: "send_message",
      threadId: thread.id,
      prompt,
    });

    const pendingId = pushPendingMessage(thread, prompt);
    ui.promptInput.value = "";
    state.stickToLatest = true;
    renderMessages();
    startAssistantPolling(thread.id, baselineAssistantCount);
    if (state.waitState) {
      state.waitState.promptText = prompt;
      state.waitState.promptComparable = normalizeComparableText(prompt);
      state.waitState.pendingId = pendingId;
    }
  } finally {
    state.sendInFlight = false;
    ui.sendBtn.disabled = false;
  }
}

async function handleNewThread() {
  const project = getSelectedProject();
  const cwdInput = window.prompt("新线程工作目录 (cwd)", project ? project.cwd : "") || "";
  const cwd = cwdInput.trim();
  if (!cwd) {
    return;
  }

  const prompt = (window.prompt("线程首条消息", "请帮我分析当前项目并给出下一步计划") || "").trim();
  if (!prompt) {
    return;
  }

  const title = (window.prompt("可选: 自定义线程标题", "") || "").trim();
  await queueOperation({
    type: "create_thread",
    cwd,
    prompt,
    title: title || undefined,
  });

  setStatus("线程创建请求已提交，等待 Agent 执行");
  await fetchSnapshot();
}

async function handleRequestSync() {
  await queueOperation({ type: "refresh_snapshot" });
  setStatus("已请求服务端刷新");
  await fetchSnapshot();
}

async function handleManualSync() {
  await fetchSnapshot();
}

async function handleSwitchBranch() {
  const project = getSelectedProject();
  if (!project) {
    setStatus("先选择项目");
    return;
  }

  const branch = String(ui.branchSelect.value || "").trim();
  if (!branch) {
    setStatus("请选择分支");
    return;
  }

  await queueOperation({
    type: "switch_branch",
    cwd: project.cwd,
    branch,
  });

  setStatus("分支切换已下发，等待同步...");
  const changed = await waitForBranchChange(project.id, branch);
  if (changed) {
    setStatus("分支已切换: " + branch);
  } else {
    setStatus("分支切换已提交，稍后点手动同步查看");
  }
}

function toggleDownloadDock() {
  if (ui.downloadDock.classList.contains("collapsed")) {
    ui.downloadDock.classList.remove("collapsed");
  } else {
    ui.downloadDock.classList.add("collapsed");
  }
}

function wireEvents() {
  ui.unlockForm.addEventListener("submit", (event) => {
    handleUnlock(event).catch((error) => {
      ui.unlockError.textContent = error.message;
    });
  });

  ui.unlockReset.addEventListener("click", () => {
    ui.agentIdInput.value = "";
    ui.masterKeyInput.value = "";
    ui.unlockError.textContent = "";
  });

  ui.sendBtn.addEventListener("click", () => {
    handleSend().catch((error) => setStatus("发送失败: " + error.message));
  });

  ui.newThreadBtn.addEventListener("click", () => {
    handleNewThread().catch((error) => setStatus("创建失败: " + error.message));
  });

  ui.manualSyncBtn.addEventListener("click", () => {
    handleManualSync()
      .catch((error) => setStatus("同步失败: " + error.message))
      .finally(() => closeSyncMenu());
  });

  ui.requestSyncBtn.addEventListener("click", () => {
    handleRequestSync()
      .catch((error) => setStatus("请求失败: " + error.message))
      .finally(() => closeSyncMenu());
  });

  ui.switchBranchBtn.addEventListener("click", () => {
    handleSwitchBranch().catch((error) => setStatus("切换失败: " + error.message));
  });

  ui.mobileMenuToggle.addEventListener("click", () => {
    openMobileDrawer();
  });

  ui.mobileDrawerClose.addEventListener("click", () => {
    closeMobileDrawer();
  });

  ui.mobileDrawerOverlay.addEventListener("click", () => {
    closeMobileDrawer();
  });

  if (ui.mobilePathProjects) {
    ui.mobilePathProjects.addEventListener("click", () => {
      setMobileNavMode("projects");
      setStatus("请选择项目");
    });
  }

  ui.downloadToggle.addEventListener("click", () => {
    toggleDownloadDock();
  });

  ui.downloadClose.addEventListener("click", () => {
    ui.downloadDock.classList.add("collapsed");
  });

  ui.syncMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSyncMenu();
  });

  ui.latestJumpBtn.addEventListener("click", () => {
    state.stickToLatest = true;
    state.unseenMessageCount = 0;
    renderLatestJumpButton();
    scrollMessagesToBottom();
  });

  ui.syncMenuPop.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", (event) => {
    if (!isSyncMenuOpen()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      closeSyncMenu();
      return;
    }
    if (!ui.syncMenuWrap.contains(target)) {
      closeSyncMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSyncMenu();
    }
  });

  ui.messages.addEventListener("scroll", () => {
    handleMessagesScroll();
  });

  if (ui.themeToggle) {
    ui.themeToggle.addEventListener("click", () => {
      toggleTheme();
    });
  }

  window.addEventListener("resize", () => {
    applyResponsiveLabels();
    closeSyncMenu();
    if (!isMobileView() && ui.topbar) {
      ui.topbar.classList.remove("topbar-hidden");
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.error("service worker register failed", error);
  }
}

async function bootstrap() {
  wireEvents();
  await registerServiceWorker();
  await loadRemoteConfig();
  ui.agentIdInput.value = localStorage.getItem("remote-vibe-agent-id") || "";
  if (ui.agentIdInput.value) {
    state.agentId = String(ui.agentIdInput.value).trim();
  }
  renderAgentBadge();
  const storedTheme = localStorage.getItem("remote-vibe-theme") || "dark";
  applyTheme(storedTheme);
  clearMessages("输入 Agent ID 与主密钥后解锁控制台。");
}

bootstrap().catch((error) => {
  setStatus("初始化失败: " + error.message);
});
`;

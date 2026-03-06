import { Dirent, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildProjectId, toProjectNameFromCwd, truncate } from "../shared/utils";
import { computeViewerProof, decryptJson, encryptJson, safeJsonParse } from "../shared/crypto";
import type {
  AgentQuotaInfo,
  AgentStatus,
  ChatMessage,
  EncryptedEnvelope,
  ProjectData,
  RemoteSnapshot,
  ThreadDetail,
  ViewerOperation,
} from "../shared/types";

const operationSchema: z.ZodType<ViewerOperation> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_thread"),
    cwd: z.string().min(1),
    prompt: z.string().min(1),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("rename_thread"),
    threadId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({
    type: z.literal("send_message"),
    threadId: z.string().min(1),
    prompt: z.string().min(1),
  }),
  z.object({
    type: z.literal("switch_branch"),
    cwd: z.string().min(1),
    branch: z.string().min(1),
  }),
  z.object({
    type: z.literal("refresh_snapshot"),
  }),
]);

const pullSchema = z.object({
  operations: z.array(
    z.object({
      opId: z.string(),
      createdAt: z.string(),
      opEnvelope: z.object({
        v: z.literal(1),
        salt: z.string(),
        iv: z.string(),
        ciphertext: z.string(),
      }),
    }),
  ),
});

const env = {
  remoteBaseUrl: process.env.REMOTE_BASE_URL?.trim() ?? "",
  agentToken: process.env.AGENT_TOKEN?.trim() ?? "",
  agentId: process.env.AGENT_ID?.trim() ?? os.hostname(),
  masterKey: process.env.MASTER_KEY?.trim() ?? "",
  codexHome: process.env.CODEX_HOME?.trim() ?? path.join(os.homedir(), ".codex"),
  loopIntervalMs: Number(process.env.LOOP_INTERVAL_MS ?? "2000"),
  pollIntervalActiveMs: Number(process.env.POLL_INTERVAL_ACTIVE_MS ?? "3000"),
  pollIntervalIdleMs: Number(process.env.POLL_INTERVAL_IDLE_MS ?? "15000"),
  activityWindowMs: Number(process.env.ACTIVITY_WINDOW_MS ?? "120000"),
  snapshotDebounceMs: Number(process.env.SNAPSHOT_DEBOUNCE_MS ?? "1500"),
  presencePingIntervalMs: Number(process.env.PRESENCE_PING_INTERVAL_MS ?? "300000"),
  liveSyncIntervalMs: Number(process.env.LIVE_SYNC_INTERVAL_MS ?? "10000"),
  remoteRetryBaseMs: Number(process.env.REMOTE_RETRY_BASE_MS ?? "15000"),
  remoteRetryMaxMs: Number(process.env.REMOTE_RETRY_MAX_MS ?? "300000"),
  remoteQuotaCooldownMs: Number(process.env.REMOTE_QUOTA_COOLDOWN_MS ?? "900000"),
  commandTimeoutMs: Number(process.env.CODEX_COMMAND_TIMEOUT_MS ?? "720000"),
  defaultModel: process.env.DEFAULT_MODEL?.trim() ?? "",
  clientVersion: "local-agent-0.1.0",
};

const localStateDir = path.join(env.codexHome, "remote-vibe");
const titleOverridePath = path.join(localStateDir, "thread-titles.json");
const sessionsDir = path.join(env.codexHome, "sessions");
const globalStatePath = path.join(env.codexHome, ".codex-global-state.json");

type StringMap = Record<string, string>;

const runtimeState: {
  syncState: AgentStatus["syncState"];
  activeOperation: string | null;
} = {
  syncState: "idle",
  activeOperation: null,
};

function assertRequiredConfig(): void {
  const required: Array<[string, string]> = [
    ["REMOTE_BASE_URL", env.remoteBaseUrl],
    ["AGENT_TOKEN", env.agentToken],
    ["MASTER_KEY", env.masterKey],
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

async function ensureLocalStateDir(): Promise<void> {
  await fs.mkdir(localStateDir, { recursive: true });
}

async function loadStringMap(filePath: string): Promise<StringMap> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = safeJsonParse<StringMap>(raw);
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function loadGlobalTitles(filePath: string): Promise<StringMap> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    if (!parsed) {
      return {};
    }
    const value = parsed["thread-titles"];
    if (!value || typeof value !== "object") {
      return {};
    }
    const result: StringMap = {};
    for (const [key, title] of Object.entries(value)) {
      if (typeof title === "string") {
        result[key] = title;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function saveStringMap(filePath: string, value: StringMap): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const result: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

async function collectLocalFingerprint(): Promise<string> {
  const hash = createHash("sha1");
  const files = (await listFilesRecursive(sessionsDir))
    .filter((file) => file.endsWith(".jsonl"))
    .sort();

  const appendFileStat = async (filePath: string): Promise<void> => {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return;
      }
      hash.update(filePath);
      hash.update(String(stat.size));
      hash.update(String(Math.floor(stat.mtimeMs)));
    } catch {
      // ignore missing/transient files
    }
  };

  for (const filePath of files) {
    await appendFileStat(filePath);
  }

  await appendFileStat(titleOverridePath);
  await appendFileStat(globalStatePath);
  return hash.digest("hex");
}

function toIso(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function extractMessageContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const value = item as { text?: string };
    if (typeof value.text === "string") {
      chunks.push(value.text);
    }
  }

  return chunks.join("\n").trim();
}

function normalizeRole(role: unknown): ChatMessage["role"] | null {
  if (role === "assistant" || role === "user" || role === "system" || role === "developer") {
    return role;
  }
  return null;
}

interface SessionQuotaSnapshot {
  updatedAt: string;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
}

interface ParsedSessionResult {
  thread: ThreadDetail;
  quota: SessionQuotaSnapshot | null;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toNullablePercent(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
}

function extractQuotaSnapshot(payload: unknown, timestamp: string): SessionQuotaSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const quotaPayload = payload as {
    type?: string;
    rate_limits?: {
      primary?: { used_percent?: number };
      secondary?: { used_percent?: number };
    };
  };

  if (quotaPayload.type !== "token_count") {
    return null;
  }

  return {
    updatedAt: timestamp,
    primaryUsedPercent: toNullablePercent(quotaPayload.rate_limits?.primary?.used_percent),
    secondaryUsedPercent: toNullablePercent(quotaPayload.rate_limits?.secondary?.used_percent),
  };
}

async function parseSessionFile(
  filePath: string,
  titleOverrides: StringMap,
  globalTitles: StringMap,
): Promise<ParsedSessionResult | null> {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const messages: ChatMessage[] = [];
  const dedupe = new Set<string>();

  let threadId = "";
  let cwd = "";
  let createdAt = "";
  let latestQuota: SessionQuotaSnapshot | null = null;

  const pushMessage = (role: ChatMessage["role"], text: string, timestamp: string) => {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }
    const normalized = normalizeComparableText(cleaned);
    const key = `${role}|${timestamp}|${normalized}`;
    if (dedupe.has(key)) {
      return;
    }

    // Same content often appears in both response_item and event_msg with tiny time skew.
    const currentMs = Date.parse(timestamp);
    for (let i = messages.length - 1; i >= 0 && i >= messages.length - 12; i -= 1) {
      const prev = messages[i];
      if (prev.role !== role) {
        continue;
      }
      if (normalizeComparableText(prev.text) !== normalized) {
        continue;
      }

      const prevMs = Date.parse(prev.timestamp);
      const canCompareTime = Number.isFinite(currentMs) && Number.isFinite(prevMs);
      if (!canCompareTime) {
        return;
      }

      // Keep repeated content if it happens later; remove near-duplicate copies only.
      if (Math.abs(currentMs - prevMs) <= 20_000) {
        return;
      }
    }

    dedupe.add(key);
    messages.push({
      id: `${messages.length + 1}`,
      role,
      text: cleaned,
      timestamp,
    });
  };

  for (const line of lines) {
    const parsed = safeJsonParse<{
      timestamp?: string;
      type?: string;
      payload?: {
        id?: string;
        cwd?: string;
        timestamp?: string;
        type?: string;
        role?: string;
        content?: unknown;
        message?: string;
        rate_limits?: {
          primary?: { used_percent?: number };
          secondary?: { used_percent?: number };
        };
      };
    }>(line);
    if (!parsed) {
      continue;
    }

    const eventTs = toIso(parsed.timestamp, new Date().toISOString());

    if (parsed.type === "session_meta" && parsed.payload) {
      threadId = parsed.payload.id?.trim() ?? threadId;
      cwd = parsed.payload.cwd?.trim() ?? cwd;
      createdAt = toIso(parsed.payload.timestamp, eventTs);
      continue;
    }

    if (parsed.type === "response_item" && parsed.payload?.type === "message") {
      const role = normalizeRole(parsed.payload.role);
      if (!role) {
        continue;
      }
      const text = extractMessageContent(parsed.payload.content);
      pushMessage(role, text, eventTs);
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload?.type === "user_message") {
      pushMessage("user", parsed.payload.message ?? "", eventTs);
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload?.type === "agent_message") {
      pushMessage("assistant", parsed.payload.message ?? "", eventTs);
    }

    if (parsed.type === "event_msg") {
      const quota = extractQuotaSnapshot(parsed.payload, eventTs);
      if (quota && (!latestQuota || latestQuota.updatedAt < quota.updatedAt)) {
        latestQuota = quota;
      }
    }
  }

  if (!threadId) {
    return null;
  }

  const firstUser = messages.find((message) => message.role === "user");
  const titleFallback = firstUser ? truncate(firstUser.text, 48) : `Thread ${threadId.slice(0, 8)}`;
  const title = titleOverrides[threadId] ?? globalTitles[threadId] ?? titleFallback;

  const lastMessage = messages[messages.length - 1];
  const updatedAt = lastMessage?.timestamp ?? (createdAt || new Date().toISOString());

  return {
    thread: {
      id: threadId,
      cwd: cwd || "unknown",
      title,
      createdAt: createdAt || updatedAt,
      updatedAt,
      messageCount: messages.length,
      lastMessagePreview: truncate(lastMessage?.text ?? "", 140),
      rolloutPath: filePath,
      messages,
    },
    quota: latestQuota,
  };
}

function toRemainingPercent(usedPercent: number | null): number | null {
  if (usedPercent === null) {
    return null;
  }
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

function toQuotaInfo(sessionQuota: SessionQuotaSnapshot | null): AgentQuotaInfo | null {
  if (!sessionQuota) {
    return null;
  }
  return {
    primaryUsedPercent: sessionQuota.primaryUsedPercent,
    secondaryUsedPercent: sessionQuota.secondaryUsedPercent,
    primaryRemainingPercent: toRemainingPercent(sessionQuota.primaryUsedPercent),
    secondaryRemainingPercent: toRemainingPercent(sessionQuota.secondaryUsedPercent),
    updatedAt: sessionQuota.updatedAt,
  };
}

async function readGitInfo(cwd: string): Promise<{ currentBranch?: string; branches?: string[] }> {
  const currentResult = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    timeoutMs: 15_000,
  });

  if (currentResult.code !== 0) {
    return {};
  }

  const branchesResult = await runCommand("git", ["branch", "--format=%(refname:short)"], {
    cwd,
    timeoutMs: 15_000,
  });

  const branches = branchesResult.code === 0
    ? branchesResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    : [];

  return {
    currentBranch: currentResult.stdout.trim(),
    branches,
  };
}

async function collectSnapshot(): Promise<RemoteSnapshot> {
  const warnings: string[] = [];
  const titleOverrides = await loadStringMap(titleOverridePath);
  const globalTitles = await loadGlobalTitles(globalStatePath);

  const files = (await listFilesRecursive(sessionsDir)).filter((file) => file.endsWith(".jsonl"));
  const threadsById: Record<string, ThreadDetail> = {};
  let latestQuota: SessionQuotaSnapshot | null = null;

  for (const filePath of files) {
    const parsedSession = await parseSessionFile(filePath, titleOverrides, globalTitles);
    if (!parsedSession) {
      continue;
    }
    const { thread, quota } = parsedSession;

    const existing = threadsById[thread.id];
    if (!existing || existing.updatedAt < thread.updatedAt) {
      threadsById[thread.id] = thread;
    }

    if (quota && (!latestQuota || latestQuota.updatedAt < quota.updatedAt)) {
      latestQuota = quota;
    }
  }

  const projectMap = new Map<string, ProjectData>();
  for (const thread of Object.values(threadsById)) {
    const cwd = thread.cwd;
    const projectId = buildProjectId(cwd);
    const project = projectMap.get(projectId) ?? {
      id: projectId,
      name: toProjectNameFromCwd(cwd),
      cwd,
      threadIds: [],
    };
    project.threadIds.push(thread.id);
    projectMap.set(projectId, project);
  }

  const projects = [...projectMap.values()];
  for (const project of projects) {
    project.threadIds.sort((a, b) => {
      const ta = threadsById[a]?.updatedAt ?? "";
      const tb = threadsById[b]?.updatedAt ?? "";
      return ta > tb ? -1 : 1;
    });
  }

  projects.sort((a, b) => {
    const aThread = threadsById[a.threadIds[0] ?? ""];
    const bThread = threadsById[b.threadIds[0] ?? ""];
    const at = aThread?.updatedAt ?? "";
    const bt = bThread?.updatedAt ?? "";
    return at > bt ? -1 : 1;
  });

  for (const project of projects) {
    const gitInfo = await readGitInfo(project.cwd);
    project.currentBranch = gitInfo.currentBranch;
    project.branches = gitInfo.branches ?? [];
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projects,
    threads: threadsById,
    warnings,
    agentStatus: {
      syncState: runtimeState.syncState,
      activeOperation: runtimeState.activeOperation,
      quota: toQuotaInfo(latestQuota),
    },
  };
}

async function workerFetch(pathname: string, init: RequestInit): Promise<Response> {
  const url = new URL(pathname, env.remoteBaseUrl);
  const headers = new Headers(init.headers ?? {});
  headers.set("x-agent-token", env.agentToken);
  headers.set("content-type", "application/json");

  return fetch(url, {
    ...init,
    headers,
  });
}

async function registerAgent(): Promise<void> {
  const viewerHash = await computeViewerProof(env.masterKey, env.agentId);
  const response = await workerFetch("/api/agent/register", {
    method: "POST",
    body: JSON.stringify({
      agentId: env.agentId,
      viewerHash,
      clientVersion: env.clientVersion,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Register failed: ${text}`);
  }
}

async function pingAgent(): Promise<void> {
  const response = await workerFetch("/api/agent/ping", {
    method: "POST",
    body: JSON.stringify({
      agentId: env.agentId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ping failed: ${text}`);
  }
}

async function pushSnapshot(snapshot: RemoteSnapshot): Promise<void> {
  const snapshotEnvelope = await encryptJson(env.masterKey, snapshot);
  const response = await workerFetch("/api/agent/snapshot", {
    method: "POST",
    body: JSON.stringify({
      agentId: env.agentId,
      snapshotEnvelope,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot push failed: ${text}`);
  }
}

async function pullOperations(): Promise<Array<{ opId: string; opEnvelope: EncryptedEnvelope }>> {
  const response = await workerFetch(
    `/api/agent/ops/pull?agentId=${encodeURIComponent(env.agentId)}&limit=20`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pull operations failed: ${text}`);
  }

  const body = (await response.json()) as unknown;
  const parsed = pullSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Invalid operation payload: ${parsed.error.message}`);
  }

  return parsed.data.operations.map((item) => ({
    opId: item.opId,
    opEnvelope: item.opEnvelope,
  }));
}

async function ackOperations(opIds: string[]): Promise<void> {
  if (opIds.length === 0) {
    return;
  }

  const response = await workerFetch("/api/agent/ops/ack", {
    method: "POST",
    body: JSON.stringify({
      agentId: env.agentId,
      opIds,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ack failed: ${text}`);
  }
}

interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  liveSync?: boolean;
  liveSyncIntervalMs?: number;
}

async function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options?.cwd,
    });

    let stdout = "";
    let stderr = "";
    let syncInFlight = false;

    const timeoutMs = options?.timeoutMs ?? env.commandTimeoutMs;
    const timeout = setTimeout(() => {
      stderr += `\nCommand timeout after ${timeoutMs}ms`;
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000).unref();
    }, timeoutMs);

    const runLiveSync = async () => {
      if (!options?.liveSync || syncInFlight) {
        return;
      }
      syncInFlight = true;
      try {
        const snapshot = await collectSnapshot();
        await pushSnapshot(snapshot);
      } catch (error) {
        console.error("[live-sync:error]", error);
      } finally {
        syncInFlight = false;
      }
    };

    const liveTimer = options?.liveSync
      ? setInterval(() => {
        void runLiveSync();
      }, options.liveSyncIntervalMs ?? env.liveSyncIntervalMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", async (code) => {
      clearTimeout(timeout);
      if (liveTimer) {
        clearInterval(liveTimer);
      }
      if (options?.liveSync) {
        await runLiveSync();
      }
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function extractSessionIdFromCommandOutput(stdout: string): string {
  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const parsed = safeJsonParse<{
      type?: string;
      payload?: { id?: string; session_id?: string };
    }>(line);
    if (!parsed) {
      continue;
    }
    if (parsed.type === "session_meta" && parsed.payload?.id) {
      return parsed.payload.id;
    }
    if (parsed.payload?.session_id) {
      return parsed.payload.session_id;
    }
  }
  return "";
}

async function handleOperation(operation: ViewerOperation, titleOverrides: StringMap): Promise<void> {
  runtimeState.syncState = "running_command";
  runtimeState.activeOperation = operation.type;

  try {
  if (operation.type === "rename_thread") {
    titleOverrides[operation.threadId] = operation.title;
    await saveStringMap(titleOverridePath, titleOverrides);
    return;
  }

  if (operation.type === "refresh_snapshot") {
    return;
  }

  if (operation.type === "create_thread") {
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--cd",
      operation.cwd,
    ];
    if (env.defaultModel) {
      args.push("--model", env.defaultModel);
    }
    args.push(operation.prompt);

    const result = await runCommand("codex", args, {
      cwd: operation.cwd,
      liveSync: true,
      liveSyncIntervalMs: env.liveSyncIntervalMs,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr || `create_thread exited with ${result.code}`);
    }

    const sessionId = extractSessionIdFromCommandOutput(result.stdout);
    if (sessionId && operation.title?.trim()) {
      titleOverrides[sessionId] = operation.title.trim();
      await saveStringMap(titleOverridePath, titleOverrides);
    }
    return;
  }

  if (operation.type === "send_message") {
    const args = [
      "exec",
      "resume",
      "--json",
      "--all",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      operation.threadId,
      operation.prompt,
    ];

    if (env.defaultModel) {
      args.splice(2, 0, "--model", env.defaultModel);
    }

    const result = await runCommand("codex", args, {
      liveSync: true,
      liveSyncIntervalMs: env.liveSyncIntervalMs,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr || `send_message exited with ${result.code}`);
    }
  }
  if (operation.type === "switch_branch") {
    const switchResult = await runCommand("git", ["switch", operation.branch], {
      cwd: operation.cwd,
      timeoutMs: 20_000,
    });
    if (switchResult.code === 0) {
      return;
    }

    const checkoutResult = await runCommand("git", ["checkout", operation.branch], {
      cwd: operation.cwd,
      timeoutMs: 20_000,
    });
    if (checkoutResult.code !== 0) {
      throw new Error(checkoutResult.stderr || switchResult.stderr || "switch_branch failed");
    }
  }
  } finally {
    runtimeState.syncState = "idle";
    runtimeState.activeOperation = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

function isQuotaError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("limit") ||
    message.includes("exceed") ||
    message.includes("429") ||
    message.includes("too many request")
  );
}

async function loop(): Promise<void> {
  await ensureLocalStateDir();

  let hasUploadedInitialSnapshot = false;
  let isRegistered = false;
  let lastLocalFingerprint = "";
  let pendingChangeSince = 0;
  let lastOpsPollAt = 0;
  let activeUntil = 0;
  let lastPresencePingAt = Date.now();
  let remoteBlockedUntil = 0;
  let remoteRetryMs = Math.max(env.remoteRetryBaseMs, env.loopIntervalMs);

  while (true) {
    try {
      const ackIds: string[] = [];
      const now = Date.now();

      if (now - lastPresencePingAt >= env.presencePingIntervalMs) {
        await pingAgent();
        lastPresencePingAt = now;
      }

      const localFingerprint = await collectLocalFingerprint();
      if (!lastLocalFingerprint) {
        lastLocalFingerprint = localFingerprint;
        pendingChangeSince = now;
      } else if (localFingerprint !== lastLocalFingerprint) {
        lastLocalFingerprint = localFingerprint;
        pendingChangeSince = now;
        activeUntil = Math.max(activeUntil, now + env.activityWindowMs);
      }

      if (now < remoteBlockedUntil) {
        const waitMs = remoteBlockedUntil - now;
        console.log(`[remote] cooling down, retry in ${Math.ceil(waitMs / 1000)}s`);
        await sleep(Math.max(Math.min(waitMs, env.loopIntervalMs), 1000));
        continue;
      }

      if (!isRegistered) {
        await registerAgent();
        isRegistered = true;
        lastPresencePingAt = now;
        remoteRetryMs = Math.max(env.remoteRetryBaseMs, env.loopIntervalMs);
        console.log("[remote] register ok");
      }

      const pollInterval = now < activeUntil || runtimeState.syncState === "running_command"
        ? env.pollIntervalActiveMs
        : env.pollIntervalIdleMs;

      if (now - lastOpsPollAt >= pollInterval) {
        lastOpsPollAt = now;
        const titleOverrides = await loadStringMap(titleOverridePath);
        const operations = await pullOperations();
        if (operations.length > 0) {
          activeUntil = now + env.activityWindowMs;
        }

        for (const item of operations) {
          try {
            const operationUnknown = await decryptJson<unknown>(env.masterKey, item.opEnvelope);
            const parsed = operationSchema.safeParse(operationUnknown);
            if (!parsed.success) {
              throw new Error(parsed.error.message);
            }
            await handleOperation(parsed.data, titleOverrides);
            ackIds.push(item.opId);
            console.log(`[op:ok] ${item.opId} ${parsed.data.type}`);
          } catch (error) {
            ackIds.push(item.opId);
            console.error(`[op:err] ${item.opId}`, error);
          }
        }
      }

      if (ackIds.length > 0) {
        await ackOperations(ackIds);
        pendingChangeSince = Date.now();
      }

      const nowAfterOps = Date.now();
      const dueByChange = pendingChangeSince > 0 && nowAfterOps - pendingChangeSince >= env.snapshotDebounceMs;
      const shouldSync = !hasUploadedInitialSnapshot || ackIds.length > 0 || dueByChange;
      if (shouldSync) {
        const snapshot = await collectSnapshot();
        await pushSnapshot(snapshot);
        hasUploadedInitialSnapshot = true;
        pendingChangeSince = 0;
        console.log(`[sync] projects=${snapshot.projects.length} threads=${Object.keys(snapshot.threads).length}`);
      }

      remoteRetryMs = Math.max(env.remoteRetryBaseMs, env.loopIntervalMs);
    } catch (error) {
      console.error("[loop:error]", error);
      isRegistered = false;
      const cooldownMs = isQuotaError(error)
        ? Math.max(env.remoteQuotaCooldownMs, remoteRetryMs)
        : remoteRetryMs;
      remoteBlockedUntil = Date.now() + cooldownMs;
      remoteRetryMs = Math.min(Math.max(remoteRetryMs * 2, env.remoteRetryBaseMs), env.remoteRetryMaxMs);
      console.error(
        `[remote] paused ${Math.ceil(cooldownMs / 1000)}s; next retry around ${new Date(remoteBlockedUntil).toISOString()}`,
      );
    }

    await sleep(Math.max(env.loopIntervalMs, 1000));
  }
}

async function main(): Promise<void> {
  assertRequiredConfig();
  console.log(`[boot] agentId=${env.agentId}`);
  console.log(`[boot] codexHome=${env.codexHome}`);
  console.log(`[boot] remoteBaseUrl=${env.remoteBaseUrl}`);
  await loop();
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});

import { z } from "zod";
import { APP_HTML } from "./web/app-html";
import { APP_CSS } from "./web/app-css";
import { APP_JS } from "./web/app-js";
import { createOpKey } from "../shared/utils";
import type { EncryptedEnvelope, WorkerMeta } from "../shared/types";

export interface Env {
  STORE: KVNamespace;
  AGENT_TOKEN: string;
  CLIENT_DOWNLOAD_URL: string;
  CLIENT_TUTORIAL_URL: string;
}

const envelopeSchema = z.object({
  v: z.literal(1),
  salt: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
});

const registerSchema = z.object({
  agentId: z.string().min(2).max(120),
  viewerHash: z.string().regex(/^[a-f0-9]{64}$/),
  clientVersion: z.string().min(1).max(40),
});

const snapshotSchema = z.object({
  agentId: z.string().min(2).max(120),
  snapshotEnvelope: envelopeSchema,
});

const viewerOpSchema = z.object({
  agentId: z.string().min(2).max(120),
  opEnvelope: envelopeSchema,
});

const ackSchema = z.object({
  agentId: z.string().min(2).max(120),
  opIds: z.array(z.string().min(1).max(120)).max(200),
});

const pingSchema = z.object({
  agentId: z.string().min(2).max(120),
});

const WEB_MANIFEST = {
  name: "Remote Vibe Coding Control",
  short_name: "RemoteVibe",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#0e1116",
  theme_color: "#0e1116",
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
};

const APP_ICON_SVG = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6ea0ff" />
      <stop offset="100%" stop-color="#89f7d5" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0e1116" />
  <rect x="88" y="96" width="336" height="320" rx="28" fill="url(#g)" opacity="0.22" />
  <path d="M188 186l-62 70 62 70" fill="none" stroke="#9ec2ff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M324 186l62 70-62 70" fill="none" stroke="#9ec2ff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M230 344h52" stroke="#89f7d5" stroke-width="24" stroke-linecap="round" />
</svg>`;

const SW_JS = String.raw`const CACHE_NAME = "remote-vibe-static-v1";
const CORE_ASSETS = ["/", "/app.css", "/app.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response("offline", { status: 503 }));

      return cached || network;
    }),
  );
});`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function text(value: string, contentType: string): Response {
  return new Response(value, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

function metaKey(agentId: string): string {
  return `meta:${agentId}`;
}

function snapshotKey(agentId: string): string {
  return `snapshot:${agentId}`;
}

function pendingOpKey(agentId: string): string {
  return `pending-op:${agentId}`;
}

interface KvUsageState {
  dayKey: string;
  reads: number;
  writes: number;
  deletes: number;
  lists: number;
  updatedAt: string;
  resetAtUtc: string;
}

const KV_FREE_LIMITS = {
  readsPerDay: 100_000,
  writesPerDay: 1_000,
  deletesPerDay: 1_000,
  listsPerDay: 1_000,
  storageBytes: 1_073_741_824,
};

const ONLINE_WINDOW_MS = 40 * 60 * 1000;

function usageKey(agentId: string, dayKey: string): string {
  return `usage:${agentId}:${dayKey}`;
}

function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getNextResetAtUtc(date: Date): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

function toUsageState(raw: string | null, dayKey: string, nowIso: string, resetAtUtc: string): KvUsageState {
  if (!raw) {
    return {
      dayKey,
      reads: 0,
      writes: 0,
      deletes: 0,
      lists: 0,
      updatedAt: nowIso,
      resetAtUtc,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<KvUsageState>;
    return {
      dayKey,
      reads: typeof parsed.reads === "number" ? parsed.reads : 0,
      writes: typeof parsed.writes === "number" ? parsed.writes : 0,
      deletes: typeof parsed.deletes === "number" ? parsed.deletes : 0,
      lists: typeof parsed.lists === "number" ? parsed.lists : 0,
      updatedAt: parsed.updatedAt ?? nowIso,
      resetAtUtc: parsed.resetAtUtc ?? resetAtUtc,
    };
  } catch {
    return {
      dayKey,
      reads: 0,
      writes: 0,
      deletes: 0,
      lists: 0,
      updatedAt: nowIso,
      resetAtUtc,
    };
  }
}

async function trackKvUsage(
  env: Env,
  agentId: string,
  delta: Partial<Pick<KvUsageState, "reads" | "writes" | "deletes" | "lists">>,
): Promise<KvUsageState> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = getUtcDayKey(now);
  const resetAtUtc = getNextResetAtUtc(now);
  const key = usageKey(agentId, dayKey);

  // Reading/writing usage stats also consumes KV operations.
  let current: KvUsageState;
  try {
    current = toUsageState(await env.STORE.get(key), dayKey, nowIso, resetAtUtc);
  } catch {
    current = toUsageState(null, dayKey, nowIso, resetAtUtc);
  }
  const next: KvUsageState = {
    dayKey,
    reads: current.reads + (delta.reads ?? 0) + 1,
    writes: current.writes + (delta.writes ?? 0) + 1,
    deletes: current.deletes + (delta.deletes ?? 0),
    lists: current.lists + (delta.lists ?? 0),
    updatedAt: nowIso,
    resetAtUtc,
  };

  try {
    await env.STORE.put(key, JSON.stringify(next));
  } catch {
    // If KV write quota is exhausted, keep API functional and return best-effort counters.
  }
  return next;
}

async function readKvUsage(env: Env, agentId: string): Promise<KvUsageState> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = getUtcDayKey(now);
  const resetAtUtc = getNextResetAtUtc(now);

  try {
    const raw = await env.STORE.get(usageKey(agentId, dayKey));
    return toUsageState(raw, dayKey, nowIso, resetAtUtc);
  } catch {
    return toUsageState(null, dayKey, nowIso, resetAtUtc);
  }
}

function readBearer(request: Request, headerName: string): string {
  return request.headers.get(headerName)?.trim() ?? "";
}

function isAgentAuthorized(request: Request, env: Env): boolean {
  const token = readBearer(request, "x-agent-token");
  return token.length > 0 && token === env.AGENT_TOKEN;
}

async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new Error("Body must be valid JSON");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((item) => item.message).join("; "));
  }

  return parsed.data;
}

async function readMeta(env: Env, agentId: string): Promise<WorkerMeta | null> {
  const raw = await env.STORE.get(metaKey(agentId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as WorkerMeta;
  } catch {
    return null;
  }
}

async function requireViewer(request: Request, env: Env, agentId: string): Promise<WorkerMeta> {
  const meta = await readMeta(env, agentId);
  if (!meta) {
    throw new Error("Unknown agentId");
  }

  const proof = readBearer(request, "x-viewer-proof");
  if (!proof || proof !== meta.viewerHash) {
    throw new Error("Invalid viewer proof");
  }

  return meta;
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/") {
        return text(APP_HTML, "text/html; charset=utf-8");
      }
      if (request.method === "GET" && pathname === "/app.css") {
        return text(APP_CSS, "text/css; charset=utf-8");
      }
      if (request.method === "GET" && pathname === "/app.js") {
        return text(APP_JS, "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && pathname === "/manifest.webmanifest") {
        return text(JSON.stringify(WEB_MANIFEST), "application/manifest+json; charset=utf-8");
      }
      if (request.method === "GET" && pathname === "/sw.js") {
        return text(SW_JS, "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && pathname === "/icon.svg") {
        return text(APP_ICON_SVG, "image/svg+xml; charset=utf-8");
      }

      if (request.method === "GET" && pathname === "/api/config") {
        return json({
          downloadUrl: env.CLIENT_DOWNLOAD_URL,
          tutorialUrl: env.CLIENT_TUTORIAL_URL,
        });
      }

      if (pathname.startsWith("/api/agent/")) {
        if (!isAgentAuthorized(request, env)) {
          return json({ error: "Unauthorized agent token" }, 401);
        }

        if (request.method === "POST" && pathname === "/api/agent/register") {
          const payload = await parseJson(request, registerSchema);
          const now = new Date().toISOString();

          const prevMeta = await readMeta(env, payload.agentId);
          const nextMeta: WorkerMeta = {
            agentId: payload.agentId,
            updatedAt: now,
            snapshotUpdatedAt: prevMeta?.snapshotUpdatedAt ?? prevMeta?.updatedAt ?? null,
            viewerHash: payload.viewerHash,
            clientVersion: payload.clientVersion,
          };

          await env.STORE.put(metaKey(payload.agentId), JSON.stringify(nextMeta));
          await trackKvUsage(env, payload.agentId, { reads: 1, writes: 1 });
          return json({ ok: true, registeredAt: now });
        }

        if (request.method === "POST" && pathname === "/api/agent/snapshot") {
          const payload = await parseJson(request, snapshotSchema);
          const meta = await readMeta(env, payload.agentId);
          if (!meta) {
            return json({ error: "agentId is not registered" }, 404);
          }

          const now = new Date().toISOString();
          const nextMeta: WorkerMeta = {
            ...meta,
            updatedAt: now,
            snapshotUpdatedAt: now,
          };

          await env.STORE.put(snapshotKey(payload.agentId), JSON.stringify(payload.snapshotEnvelope));
          await env.STORE.put(metaKey(payload.agentId), JSON.stringify(nextMeta));
          await trackKvUsage(env, payload.agentId, { reads: 1, writes: 2 });
          return json({ ok: true, updatedAt: now });
        }

        if (request.method === "POST" && pathname === "/api/agent/ping") {
          const payload = await parseJson(request, pingSchema);
          const meta = await readMeta(env, payload.agentId);
          if (!meta) {
            return json({ error: "agentId is not registered" }, 404);
          }

          const now = new Date().toISOString();
          const nextMeta: WorkerMeta = {
            ...meta,
            updatedAt: now,
          };

          await env.STORE.put(metaKey(payload.agentId), JSON.stringify(nextMeta));
          return json({ ok: true, updatedAt: now });
        }

        if (request.method === "GET" && pathname === "/api/agent/ops/pull") {
          const agentId = (url.searchParams.get("agentId") ?? "").trim();
          if (!agentId) {
            return json({ error: "agentId is required" }, 400);
          }
          const operations: Array<{ opId: string; opEnvelope: EncryptedEnvelope; createdAt: string }> = [];

          const raw = await env.STORE.get(pendingOpKey(agentId));
          if (raw) {
            try {
              const item = JSON.parse(raw) as {
                opId: string;
                opEnvelope: EncryptedEnvelope;
                createdAt: string;
              };
              operations.push(item);
            } catch {
              // ignore malformed entry
            }
          }

          return json({ operations });
        }

        if (request.method === "POST" && pathname === "/api/agent/ops/ack") {
          const payload = await parseJson(request, ackSchema);
          const raw = await env.STORE.get(pendingOpKey(payload.agentId));
          if (!raw) {
            return json({ ok: true, deleted: 0 });
          }

          try {
            const current = JSON.parse(raw) as { opId?: string };
            if (!current.opId || !payload.opIds.includes(current.opId)) {
              return json({ ok: true, deleted: 0 });
            }
          } catch {
            return json({ ok: true, deleted: 0 });
          }

          await env.STORE.delete(pendingOpKey(payload.agentId));
          await trackKvUsage(env, payload.agentId, { reads: 1, deletes: 1 });
          return json({ ok: true, deleted: 1 });
        }

        return json({ error: "Not found" }, 404);
      }

      if (pathname.startsWith("/api/view/")) {
        if (request.method === "GET" && pathname === "/api/view/snapshot") {
          const agentId = (url.searchParams.get("agentId") ?? "").trim();
          if (!agentId) {
            return json({ error: "agentId is required" }, 400);
          }

          try {
            const meta = await requireViewer(request, env, agentId);
            const rawEnvelope = await env.STORE.get(snapshotKey(agentId));
            const kvUsage = await readKvUsage(env, agentId);
            const lastSeenAt = meta.updatedAt;
            const snapshotUpdatedAt = meta.snapshotUpdatedAt ?? meta.updatedAt;
            const lastSeenMs = Date.parse(lastSeenAt);
            const online = Number.isFinite(lastSeenMs)
              ? Date.now() - lastSeenMs <= ONLINE_WINDOW_MS
              : false;
            return json({
              updatedAt: snapshotUpdatedAt,
              snapshotEnvelope: rawEnvelope ? (JSON.parse(rawEnvelope) as EncryptedEnvelope) : null,
              agentPresence: {
                agentId: meta.agentId,
                online,
                lastSeenAt,
                snapshotUpdatedAt,
              },
              kvUsage: {
                ...kvUsage,
                limits: KV_FREE_LIMITS,
              },
            });
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Unauthorized" }, 401);
          }
        }

        if (request.method === "POST" && pathname === "/api/view/ops") {
          const payload = await parseJson(request, viewerOpSchema);
          try {
            await requireViewer(request, env, payload.agentId);
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Unauthorized" }, 401);
          }

          const existingRaw = await env.STORE.get(pendingOpKey(payload.agentId));
          if (existingRaw) {
            return json({ error: "Agent 当前还有未处理任务，请稍后刷新后再发起新任务" }, 409);
          }

          const opId = createOpKey();
          const record = {
            opId,
            opEnvelope: payload.opEnvelope,
            createdAt: new Date().toISOString(),
          };
          await env.STORE.put(pendingOpKey(payload.agentId), JSON.stringify(record));
          await trackKvUsage(env, payload.agentId, { reads: 1, writes: 1 });
          return json({ ok: true, opId });
        }

        return json({ error: "Not found" }, 404);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

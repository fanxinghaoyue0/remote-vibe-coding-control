export type Role = "user" | "assistant" | "system" | "developer";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  timestamp: string;
}

export interface ThreadSummary {
  id: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string;
  rolloutPath: string;
}

export interface ThreadDetail extends ThreadSummary {
  messages: ChatMessage[];
}

export interface ProjectData {
  id: string;
  name: string;
  cwd: string;
  threadIds: string[];
  currentBranch?: string;
  branches?: string[];
}

export interface AgentQuotaInfo {
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
  primaryRemainingPercent: number | null;
  secondaryRemainingPercent: number | null;
  updatedAt: string | null;
}

export interface AgentStatus {
  syncState: "idle" | "running_command";
  activeOperation: string | null;
  quota: AgentQuotaInfo | null;
}

export interface RemoteSnapshot {
  version: 1;
  generatedAt: string;
  projects: ProjectData[];
  threads: Record<string, ThreadDetail>;
  warnings: string[];
  agentStatus: AgentStatus;
}

export type ViewerOperation =
  | {
      type: "create_thread";
      cwd: string;
      prompt: string;
      title?: string;
    }
  | {
      type: "rename_thread";
      threadId: string;
      title: string;
    }
  | {
      type: "send_message";
      threadId: string;
      prompt: string;
    }
  | {
      type: "switch_branch";
      cwd: string;
      branch: string;
    }
  | {
      type: "refresh_snapshot";
    };

export interface EncryptedEnvelope {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface WorkerMeta {
  agentId: string;
  updatedAt: string;
  snapshotUpdatedAt?: string | null;
  viewerHash: string;
  clientVersion: string;
}

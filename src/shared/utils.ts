export function toProjectNameFromCwd(cwd: string): string {
  const trimmed = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  const last = trimmed.split("/").pop();
  return last && last.length > 0 ? last : cwd;
}

export function buildProjectId(cwd: string): string {
  return `proj:${cwd}`;
}

export function createOpKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

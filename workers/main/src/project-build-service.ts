/**
 * 專案建置服務（project build service）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定。原始本檔只是把實作再匯出
 * 給四個來源模組（project-build-commands.ts、project-build-contracts.ts、
 * project-build-result-policy.ts、project-build-sandbox-lifecycle.ts），那些模組隨容器
 * 功能一併移除，故這裡直接保留「同名的型別、純字串工具與拋錯佔位」，讓仍參照本模組的
 * routes/admin/routes.ts（`buildLogTail`、`cleanBuildLog`、`getProjectBuildSandbox`、
 * `runProjectBuild`）能通過型別檢查；會碰容器的函式一律拋出明確錯誤。
 *
 * 原始實作：每個組織一個常溫建置容器（原生 Durable Object 容器 API），把專案原始碼
 * materialize 進去、跑 `bun install && bun run build`，再把變更集與鎖檔 persist 回專案
 * 儲存；建置日誌另存到 R2 / 專案檔。Free Tier 沒有這條路徑。
 */
import type { ProjectBuildSandboxLike } from './project-worker-bundle.js';
import type { WorkspaceFileStoreLike } from './workspace-filesystem-do.js';

/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_BUILD_ERROR = 'Free Tier：已移除專案建置容器（project-build-service）';

/** 未宣告 timeout 時的建置預算（毫秒）。 */
export const DEFAULT_BUILD_TIMEOUT_MS = 120_000;

/** 單次命令輸出寫入日誌的上限（字元）。 */
const MAX_COMMAND_OUTPUT_LOG_CHARS = 4000;

/** 建置日誌摘錄上限（字元），保留尾端——錯誤通常出現在最後。 */
const BUILD_LOG_EXCERPT_MAX_CHARS = 10_000;

/** 每個階段的耗時（毫秒），供效能診斷。 */
export interface ProjectBuildTimings {
  collectSourceMs: number;
  sourceListMs: number;
  sourceReadMs: number;
  sourceHashMs: number;
  materializeMs: number;
  previousManifestReadMs: number;
  archiveCreateMs: number;
  archiveWriteMs: number;
  materializeExecMs: number;
  commandMs: number;
  persistMs: number;
  totalMs: number;
}

/** 一次建置的結果（失敗也是值，不拋錯）。 */
export interface ProjectBuildResult {
  success: boolean;
  projectId: string;
  workdir: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  fileCount: number;
  sourceBytes: number;
  durationMs: number;
  timings: ProjectBuildTimings;
  lockfilePersisted: boolean;
  buildLogPath?: string;
  buildLogPersisted?: boolean;
  buildLogBytes?: number;
  error?: string;
}

/** 一次安裝依賴（`bun add`）的結果。 */
export interface ProjectDependencyResult {
  success: boolean;
  projectId: string;
  workdir: string;
  dependency: string;
  dev: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  fileCount: number;
  sourceBytes: number;
  durationMs: number;
  timings: ProjectBuildTimings;
  packageJsonPersisted: boolean;
  lockfilePersisted: boolean;
  error?: string;
}

/**
 * 清理建置日誌：剷掉 ANSI 跳脫序列與裸 CR、統一行尾、去行尾空白、把三個以上空行壓成一
 * 個，最後 trim；全空時回 `null`。純字串函式。
 */
export function cleanBuildLog(raw: string): string | null {
  const cleaned = raw
    // oxlint-disable-next-line no-control-regex -- 這些運算式刻意移除 ANSI 跳脫序列。
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    // oxlint-disable-next-line no-control-regex -- 移除其餘跳脫字元。
    .replace(/\u001b/g, "")
    .replace(/\r(?!\n)/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

/**
 * 建置日誌尾端摘錄（不超過 BUILD_LOG_EXCERPT_MAX_CHARS 字元，被截時標明省略多少字元）。
 * 純字串函式。參數容許 `null`：消費端（admin routes）會把 `cleanBuildLog()` 的結果直接
 * 傳進來，而它可能是 `null`。
 */
export function buildLogTail(raw: string | null): string | null {
  if (raw === null) return null;
  const cleaned = cleanBuildLog(raw);
  if (!cleaned) return null;
  if (cleaned.length <= BUILD_LOG_EXCERPT_MAX_CHARS) return cleaned;
  return `[truncated ${cleaned.length - BUILD_LOG_EXCERPT_MAX_CHARS} chars]\n${cleaned.slice(-BUILD_LOG_EXCERPT_MAX_CHARS)}`;
}

/** 命令輸出進日誌前的截斷（保留尾端）。純字串函式，留供同模組呼叫端使用。 */
export function commandOutputForLog(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_COMMAND_OUTPUT_LOG_CHARS) return trimmed;
  const omitted = trimmed.length - MAX_COMMAND_OUTPUT_LOG_CHARS;
  return `[truncated ${omitted} chars]\n${trimmed.slice(-MAX_COMMAND_OUTPUT_LOG_CHARS)}`;
}

/** Durable Object 名稱長度上限（Cloudflare sandbox id 限制）。 */
const MAX_PROJECT_BUILD_SANDBOX_KEY_LENGTH = 63;

/** 用於 DO 名稱的穩定非加密雜湊（FNV-1a，不具安全性）。 */
function stableHexHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 組織共用的專案建置 sandbox 的穩定 Durable Object 名稱（`org-<slug>`，過長時以雜湊後綴
 * 截斷）。純字串函式，保留讓日誌與佔位判斷仍能取得同一個 key。
 */
export function projectBuildSandboxKey(orgId: string): string {
  const org = orgId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!org) throw new Error("orgId is required");
  const readable = `org-${org}`;
  if (readable.length <= MAX_PROJECT_BUILD_SANDBOX_KEY_LENGTH) return readable;
  const hash = stableHexHash(org);
  const prefixLength = MAX_PROJECT_BUILD_SANDBOX_KEY_LENGTH - hash.length - 1;
  const prefix = readable.slice(0, prefixLength).replace(/-+$/g, "");
  return `${prefix}-${hash}`;
}

/**
 * 取得組織的建置容器（每組織一個 ProjectBuildContainer，位於其當前 placement 世代）。
 * Free Tier 沒有容器綁定，直接拋錯。
 */
export function getProjectBuildSandbox(_env: unknown, _orgId: string): ProjectBuildSandboxLike {
  throw new Error(FREE_TIER_BUILD_ERROR);
}

/**
 * 把專案原始碼 materialize 進建置容器並執行建置命令。
 * Free Tier 沒有容器與專案儲存的寫入路徑，直接拋錯。
 */
export async function runProjectBuild(_input: {
  projectId: string;
  files: WorkspaceFileStoreLike;
  sandbox: ProjectBuildSandboxLike;
  timeoutMs?: number;
}): Promise<ProjectBuildResult> {
  throw new Error(FREE_TIER_BUILD_ERROR);
}

/**
 * 在專案裡安裝一個依賴（`bun add`）並把 package.json / 鎖檔 persist 回去。
 * Free Tier 沒有建置容器，直接拋錯。
 */
export async function runProjectAddDependency(_input: {
  projectId: string;
  dependency: string;
  dev?: boolean;
  files: WorkspaceFileStoreLike;
  sandbox: ProjectBuildSandboxLike;
}): Promise<ProjectDependencyResult> {
  throw new Error(FREE_TIER_BUILD_ERROR);
}

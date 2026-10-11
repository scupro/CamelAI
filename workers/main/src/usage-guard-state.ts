/**
 * 用量守衛狀態（usage guard state）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除 app 用量守衛（`app-usage-guard` 工作程序、追蹤稽核、隔離
 * （quarantine）與 suspension 流程），本檔只保留註冊表欄位型別、狀態常數與
 * 「純字串」的租約名稱產生器，讓仍參照本模組的 services/deploy.ts 與
 * user-app-cost-controls-backfill.ts 能通過型別檢查。
 *
 * 行為取捨（比照本專案「只計費顯示／限制者一律未受限」的原則）：
 * - `ensureUsageGuardSchema` 不建立任何 `app_usage_guard_*` 資料表（no-op）。
 * - 租約（operation lease）是防止「同一 app 同時被部署與守衛重寫」的互斥鎖，
 *   沒有守衛就沒有競爭，一律視為取得／釋放成功。
 * - `markUsageGuardEligible` 不寫 D1，回傳未受限的原預設值（active、無觀測期）。
 * - `isUsageGuardRecovery` 一律 false：Free Tier 不會有 suspending／suspended
 *   狀態的部署。
 *
 * 原始實作：上述函式會確保五張 `app_usage_guard_*` 資料表存在，並在 D1 中讀寫
 * 狀態、評估紀錄、事件與租約列。
 */

export type UsageGuardStatus =
  | "unmonitored"
  | "active"
  | "warned"
  | "suspending"
  | "suspended"
  | "probation"
  | "error"
  | "exempt";

/** 被暫停後重新部署的觀測期長度（毫秒）。 */
export const USAGE_GUARD_PROBATION_MS = 60 * 60 * 1000;

/** 單一 app 操作租約的效期（毫秒）。 */
export const USAGE_GUARD_OPERATION_LEASE_TTL_MS = 60_000;

/** 租約被佔用時，最多等待多久（毫秒）。 */
export const USAGE_GUARD_OPERATION_LEASE_WAIT_MS = 15_000;

/** 寫進 app 註冊表（KV）的用量守衛欄位。 */
export interface UsageGuardRegistryFields {
  usage_guard_status?: UsageGuardStatus;
  usage_guard_eligible_version?: string;
  usage_guard_eligible_at?: number;
  usage_guard_probation_until?: number | null;
  usage_guard_reason?: string | null;
}

/** 租約取得結果（嘗試次數與等待時間僅供觀測）。 */
export interface UsageGuardOperationLeaseAcquireResult {
  acquired: boolean;
  attempts: number;
  waitedMs: number;
}

/**
 * 確保用量守衛的 D1 資料表存在。
 *
 * Free Tier 沒有用量守衛，因此不再建立 `app_usage_guard_*` 資料表；原回傳型別
 * 為 `Promise<void>`，這裡維持 no-op。
 */
export async function ensureUsageGuardSchema(_db: D1Database): Promise<void> {
  return undefined;
}

/** 某個 app 的操作租約名稱（純字串產生器，與原實作相同）。 */
export function operationLeaseName(appId: string): string {
  return `app-operation:${appId}`;
}

/** 取得某個 app 的操作租約；Free Tier 沒有競爭者，一律成功。 */
export async function acquireUsageGuardOperationLease(_input: {
  db: D1Database;
  appId: string;
  holder: string;
  now?: number;
  ttlMs?: number;
}): Promise<boolean> {
  return true;
}

/** 帶重試與抖動（jitter）的租約取得；Free Tier 立即成功，不等待。 */
export async function acquireUsageGuardOperationLeaseWithRetry(
  _input: {
    db: D1Database;
    appId: string;
    holder: string;
    ttlMs?: number;
    waitMs?: number;
    retryMs?: number;
  },
  _runtime: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  } = {},
): Promise<UsageGuardOperationLeaseAcquireResult> {
  return { acquired: true, attempts: 1, waitedMs: 0 };
}

/** 釋放某個 app 的操作租約；Free Tier 沒有租約可刪，no-op。 */
export async function releaseUsageGuardOperationLease(_input: {
  db: D1Database;
  appId: string;
  holder: string;
}): Promise<void> {
  return undefined;
}

/**
 * 把用量守衛指向新上傳的 script 版本。
 *
 * 原實作會重寫 D1 狀態列（暫停計數、隔離嘗試等歸零），並保留管理員手動設定的
 * `exempt` 狀態。Free Tier 沒有守衛，因此不寫任何資料，只回傳原本「非 recovery」
 * 路徑的預設值，讓部署註冊表照樣能寫出一致的欄位。
 */
export async function markUsageGuardEligible(_input: {
  db: D1Database;
  appId: string;
  dispatchScriptName: string;
  orgId: string;
  workspaceId: string;
  scriptName: string;
  scriptVersion: string;
  artifactCacheKey?: string;
  recovering: boolean;
  now?: number;
}): Promise<{ status: "active" | "probation" | "exempt"; probationUntil: number | null; reasonCode: string | null }> {
  return { status: "active", probationUntil: null, reasonCode: null };
}

/**
 * 判斷某個狀態是否代表「從暫停中復原」的部署（原實作：suspending／suspended／error）。
 * Free Tier 永遠不會進入這些狀態，一律 false。
 */
export function isUsageGuardRecovery(_status: unknown): boolean {
  return false;
}

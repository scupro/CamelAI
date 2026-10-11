/**
 * SQL 查詢服務的 Worker 端編排 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定，本檔僅保留型別介面
 * 與純函式（容器名稱產生器、短暫錯誤判斷），讓仍參照本模組的 data-proxy.ts、
 * db-query-compat.ts 與 admin routes 能通過型別檢查；實際取得容器、執行查詢或
 * 匯出的函式一律拋出明確錯誤。
 *
 * 原始實作：查詢邏輯內嵌在 db-query runner 來源中，於 DbQueryContainer 以單次
 * `exec` 透過 stdin 管線送給 node 執行（不落地檔案），並可經由 SOCKS 中繼站取得
 * 固定出口 IP。Free Tier 沒有容器，這些路徑都不存在。
 */

// ── 出口中繼站（egress relay）──────────────────────────────────────────
/** 中繼站座標與憑證（來自 Worker 環境變數，絕不寫進映像檔）。 */
export interface DbEgressRelayConfig {
  hostname: string;
  socksUsername: string;
  socksPassword: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

export interface DbEgressRelayEnv {
  DB_EGRESS_RELAY_HOSTNAME?: string;
  DB_EGRESS_RELAY_SOCKS_USERNAME?: string;
  DB_EGRESS_RELAY_SOCKS_PASSWORD?: string;
  DB_EGRESS_RELAY_ACCESS_CLIENT_ID?: string;
  DB_EGRESS_RELAY_ACCESS_CLIENT_SECRET?: string;
}

/**
 * 此環境的中繼站設定。
 *
 * Free Tier 沒有容器中繼站，因此一律回傳 null（＝完全未設定＝直連模式）。
 * 原實作會在「中繼站只設定了一半」時拋出明確的設定錯誤，而不是無聲地降階。
 */
export function relayConfigFromEnv(_env: DbEgressRelayEnv): DbEgressRelayConfig | null {
  return null;
}

// ── 查詢請求與結果的契約型別 ───────────────────────────────────────────
export interface DbQueryTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  /** 只有 mysql 可以留空（與 Go data-proxy 行為一致）。 */
  database: string;
  /**
   * 預設 "require"；"verify-full" 開啟憑證鏈與主機名稱驗證，"verify-ca" 只驗證
   * 憑證鏈，"prefer"（mysql）先試 TLS，伺服器不支援時退回明文。
   */
  sslMode?: "disable" | "require" | "verify-ca" | "verify-full" | "prefer";
  /** 只有 mysql 使用；識別碼，例如 "utf8mb4"（驅動程式預設值）。 */
  charset?: string;
}

export interface DbQueryRequest {
  /** "query"（預設）：單次點對點查詢；"export"：串流 Parquet 匯出。 */
  op?: "query" | "export";
  engine: "postgres" | "mysql" | "mssql";
  /** "read"（預設）在會回滾的交易中執行；"modify" 回傳 rowsAffected。 */
  mode?: "read" | "modify";
  target: DbQueryTarget;
  sql: string;
  /** postgres/mysql 使用 positional 陣列；mssql 使用具名 record。 */
  params?: unknown[] | Record<string, unknown>;
  /** null ＝不限制列數（仍受位元組上限約束）。 */
  rowLimit?: number | null;
  timeoutMs?: number;
  /** op "query" 的序列化結果大小上限（runner 內預設 8 MiB）。 */
  maxResponseBytes?: number;
}

export type DbQueryResult =
  | {
      ok: true;
      rows: Record<string, unknown>[];
      fields: { name: string }[];
      rowCount: number;
      truncated: boolean;
      durationMs: number;
      /** 只有 mode "modify" 會帶。 */
      rowsAffected?: number[];
    }
  | { ok: false; error: { message: string; code?: string; number?: number; status?: number } };

export type DbExportResult =
  | { ok: true; rowCount: number; bytes: number; durationMs: number }
  | { ok: false; error: { message: string; code?: string; number?: number; status?: number } };

// ── 容器契約（原 db-query-contracts.ts 已隨付費功能移除，此處只留型別）──
/** 容器內 `cloudflared access tcp` 轉發器監聽的本地埠。 */
export const DB_RELAY_LOCAL_PORT = 11080;

/** 中繼站轉發器需要的資訊：要連到哪裡，以及 Access service token。 */
export interface DbRelayForwarderConfig {
  hostname: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

/** runner 單次執行的輸出。`timedOut`：容器端的時間上限觸發。 */
export interface DbRunnerOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Worker 端會呼叫的 DbQueryContainer 介面（也是測試注入假物件時的形狀）。
 * Free Tier 沒有對應實作，只保留型別。
 */
export interface DbQueryContainerStub {
  /** 啟動容器；能在上面執行命令後 resolve。 */
  start(): Promise<void>;
  /** 除非轉發器已在啟動或已在運作，否則啟動它。 */
  startRelayForwarder(relay: DbRelayForwarderConfig): Promise<void>;
  /** 轉發器的本地埠是否已經可以接受連線。 */
  relayForwarderReady(): Promise<boolean>;
  /** 以 `env` 執行 runner 一次，容器端由 `timeoutMs` 設為上限。 */
  runRunner(env: Record<string, string>, timeoutMs: number): Promise<DbRunnerOutput>;
  /** 讓 `/<prefix>` 可寫，供匯出寫進倉儲桶。 */
  prepareWarehouseExport(prefix: string): Promise<void>;
  /** 在 runDbExport 返回之前，讓匯出在桶中正式落地。 */
  publishWarehouseExport(prefix: string, exportPath: string): Promise<void>;
  /** 停止容器，讓下一次呼叫啟動全新的容器。 */
  destroy(reason?: { operation: string; error?: string }): Promise<{ destroyed: boolean }>;
}

/** 等待中的容器操作超出客戶端期限時的事件內容。 */
export interface SandboxDeadlineExceededEvent {
  operation: string;
  declaredTimeoutMs: number | undefined;
  budgetMs: number;
  waitedMs: number;
  /** 期限已耗盡、我們拒絕把工作派出去時為 false。 */
  started?: boolean;
}

/** 一次查詢所需的相依物件與回呼（環境與遙測由呼叫端持有）。 */
export interface DbQueryDeps {
  container: DbQueryContainerStub;
  /**
   * 我們放棄等待某次查詢時的遙測出口。呼叫端擁有 observability env，
   * 所以由它提供記錄器。
   */
  onDeadlineExceeded?: (event: SandboxDeadlineExceededEvent) => void;
  /**
   * 固定 IP 出口中繼站；null 表示直接從容器自己的 Cloudflare IP 連資料庫
   * （沒有中繼站時的選擇性退路，沒有固定 IP 的保證）。
   */
  relay: DbEgressRelayConfig | null;
  /** 等待 cloudflared 轉發器就緒的最大毫秒數（預設 30 秒）。 */
  readinessTimeoutMs?: number;
  /**
   * 因容器短暫故障而重試時的遙測出口；`error` 是我們重試過去的那個錯誤。
   */
  onTransientRetry?: (event: { operation: "db_query" | "db_export"; dispatched: boolean; error: unknown }) => void;
  /** 短暫重試之前那段等待的測試注入點。 */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 容器 / Durable Object 傳輸層本身的失敗（不是資料庫或 SQL 的問題）：容器在呼叫
 * 過程中被停止，或到 DO 的 RPC 跳點斷掉（"Network connection lost."）。
 * 下一次呼叫會啟動一個新容器。
 *
 * 刻意不含 SandboxDeadlineExceededError：期限到了代表容器很慢或卡死，
 * 重試只会讓等待時間加倍。
 */
const TRANSIENT_CONTAINER_ERROR_PATTERNS: readonly RegExp[] = [
  /network connection lost/i,
  /signalled the container to exit/i,
  /container crashed/i,
  /durable object (?:reset|storage operation exceeded)|durable object's code has been updated/i,
];

/**
 * 容器不在執行中而無法操作：啟動失敗，或在呼叫過程中停止。屬於短暫錯誤，
 * 下一次呼叫會啟動新容器，所以 db-query-service 會重試一次。
 *
 * 在 Durable Object 內部抛出、於 Worker 端辨識：DO 的 RPC 跳點只會送來一個
 * 原名稱被前綴在訊息裡的普通 `Error`，因此呼叫端使用 `is()` 而非 `instanceof`。
 */
export class DbQueryContainerUnavailableError extends Error {
  static is(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === "DbQueryContainerUnavailableError" ||
      error.message.startsWith("DbQueryContainerUnavailableError: ");
  }

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`DB query container is not running (${operation}): ${detail}`, { cause });
    this.name = "DbQueryContainerUnavailableError";
  }
}

/**
 * 判斷某個錯誤是否屬於「可以重試一次」的容器短暫故障（純名稱與訊息判斷）。
 *
 * Free Tier 沒有容器，所以不再引用已移除的逾時類別；原實作會排除的
 * SandboxDeadlineExceededError（等待過久）與 ContainerStartFailedError
 * （DO 內部已重試過啟動）在此以名稱同等排除。
 */
export function isTransientDbContainerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "SandboxDeadlineExceededError") return false;
  if (error.name === "ContainerStartFailedError") return false;
  if (DbQueryContainerUnavailableError.is(error)) return true;
  const text = `${error.name}: ${error.message}`;
  return TRANSIENT_CONTAINER_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/** 短暫容器故障後、重試之前的等待時間，讓正在輪替的容器有機會回來。 */
export const DB_QUERY_TRANSIENT_RETRY_DELAY_MS = 1_000;

/**
 * 容器「未能就緒」的錯誤：查詢並沒有送進資料庫，因此重試同一個查詢是安全的。
 * 原實作由卡死的啟動期限錯誤包裝而成，這裡保留同樣的外觀。
 */
export class DbQueryContainerNotReadyError extends Error {
  readonly operation: string;
  readonly budgetMs: number;

  constructor(cause: { operation: string; budgetMs: number }, restarted: boolean) {
    super(
      `SQL 查詢容器未能就緒：${cause.operation} 未在 ` +
        `${Math.round(cause.budgetMs / 1000)} 秒的期限內回傳，因此查詢並沒有送進資料庫。` +
        `這是暫時的基礎設施問題，不是 SQL 或資料庫的問題。` +
        (restarted ? "容器已重新啟動；" : "") +
        `重試同一個查詢是安全的。（Free Tier 已移除 SQL 查詢容器。）`,
      { cause },
    );
    this.name = "DbQueryContainerNotReadyError";
    this.operation = cause.operation;
    this.budgetMs = cause.budgetMs;
  }
}

// ── 純函式：容器實例名稱 ───────────────────────────────────────────────
/** 某工作區容器的實例名稱（小寫，與 0.12 正規化之後一致）。 */
export function dbQueryContainerKey(workspaceId: string): string {
  return `ws-${workspaceId}`.toLowerCase();
}

// ── Free Tier 已移除的容器操作（保留簽名，呼叫即錯）────────────────────
/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_CONTAINER_ERROR = "Free Tier：已移除 SQL 查詢容器（DbQueryContainer）";

/**
 * 取得 `key` 對應的 db-query 容器（取自 dbQueryContainerKey()，或 admin 冒煙
 * 測試的 key）。原實作會沿著 sandbox placement 的世代取得目前那個 DO 的存根。
 */
export function getDbQueryContainer(_env: unknown, _key: string): DbQueryContainerStub {
  throw new Error(FREE_TIER_CONTAINER_ERROR);
}

/**
 * 執行一次已由 Worker 授權的查詢。原實作依 `deps.relay` 決定要透過固定 IP
 * 中繼站隧道，還是從容器自己的 IP 直接連資料庫。
 */
export async function runDbQuery(_deps: DbQueryDeps, _request: DbQueryRequest): Promise<DbQueryResult> {
  throw new Error(FREE_TIER_CONTAINER_ERROR);
}

/**
 * 執行一次已由 Worker 授權的大量匯出：runner 把唯讀結果串流成 Parquet，直接寫進
 * 工作區掛載的倉儲 R2 前綴，資料完全不經過 Worker。`exportPath` 必須是
 * `'/' + r2Key`（在掛載的前綴內），`mountPrefix` 是該工作區的倉儲前綴。
 */
export async function runDbExport(
  _deps: DbQueryDeps,
  _request: DbQueryRequest,
  _mountPrefix: string,
  _exportPath: string,
): Promise<DbExportResult> {
  throw new Error(FREE_TIER_CONTAINER_ERROR);
}

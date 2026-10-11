/**
 * 倉儲服務（WarehouseService）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定，本檔僅保留型別介面與
 * 純函式（連線標註、Python `params` 前置碼、舊版結果形狀包裝，皆不碰儲存），讓仍
 * 參照本模組的 analysis-service.ts（`annotateWarehouseConnections`、
 * `withWarehouseParams`、`type WarehouseConnection`）與 index.ts 的再匯出
 * （`WarehouseService`）能通過型別檢查；需要容器或 R2 的方法一律拋出明確錯誤。
 *
 * 原始實作：`WarehouseService` 是合併前 WAREHOUSE 虛擬綁定的來源相容 shim——已部署
 * 的使用者應用程式在部署時就把 `WAREHOUSE` service binding 烤死指向這個 entrypoint，
 * 因此類別與它的兩個方法必須仍可解析。封閉式的 WarehouseSandbox 容器已不存在，兩個
 * 方法都改為委派 AnalysisService（統一分析層），遵守同一契約：
 * `runCode({ code, params })` → 在 workspace 以 R2 暫存的匯出档上跑 DuckDB，結果由
 * stdout 回傳。新的應用程式改綁 `ANALYSIS`，不再對外宣傳 WAREHOUSE。
 * Free Tier 沒有分析容器，連委派的那條路也不存在，故方法直接拋錯。
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { isBigQueryMcpIntegration } from './bigquery-mcp.js';
import { isClickHouseMcpIntegration } from './clickhouse-mcp.js';
import { isSqlDatabaseMcpIntegration } from './sql-database-mcp.js';
import type { Env } from './types.js';

/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_WAREHOUSE_ERROR = 'Free Tier：已移除倉儲服務（WarehouseService）';

export interface WarehouseRunRequest {
  /** 要在工作區 sandbox 裡執行的 Python 原始碼（強烈建議用 DuckDB）。 */
  code: string;
  /**
   * 以 `params` 字典注入 Python 執行期選項（例如 `{ r2_key }`），讓呼叫端寫
   * `params["r2_key"]`，不要把值插進命令字串（遇到特殊字元很脆弱）。僅限可
   * JSON 序列化的值。
   */
  params?: Record<string, unknown>;
}

export interface WarehouseRunResult {
  ok: boolean;
  /** captured stdout（程式碼所有 `print()` 的內容），已串接。 */
  stdout?: string;
  /** captured stderr。 */
  stderr?: string;
  /**
   * 合併前直譯器的負載外形。分析層以 stdout/stderr 回報，因此 shim 合成合併前呼叫端
   * 真的會讀的 `logs` 形狀（`result.logs.stdout` / `result.logs.stderr`）；更豐富的
   * 直譯器欄位（逐儲存格輸出）已不存在。
   */
  result?: unknown;
  error?: string;
}

/**
 * 把分析層的 runCode 結果包成合併前 WAREHOUSE 的形狀：舊 entrypoint 曾在 `result`
 * 裡回傳 code-interpreter 負載，而文件上唯一的消費方式為
 * `result.logs.stdout[…]` / `result.logs.stderr[…]`（見舊版 extractWarehouseStdio）。
 * 這裡正好合成那個形狀，讓仍在探測 `result` 的已部署應用程式繼續可用。純函式、可單元測驗證。
 */
export function toWarehouseCompatResult(response: WarehouseRunResult): WarehouseRunResult {
  if (response.result !== undefined) return response;
  return {
    ...response,
    result: {
      logs: {
        stdout: response.stdout ? [response.stdout] : [],
        stderr: response.stderr ? [response.stderr] : [],
      },
      ...(response.ok ? {} : { error: { name: "Error", message: response.error ?? "analysis code failed" } }),
    },
  };
}

/** 工作區的一條連線，加上供分析 / 倉儲使用的標註。 */
export interface WarehouseConnection {
  id: string;
  name: string;
  type: string;
  displayName: string;
  /**
   * 此連線是否有 `export` 方法，也就是完整的查詢結果能否暫存到 R2
   * （`connections[alias].export({ query })`）。目前涵蓋 SQL 資料庫家族
   * （Postgres/MySQL/Neon/PlanetScale）、BigQuery 與 ClickHouse；其他型別還沒有
   * `export` 方法。
   */
  exportable: boolean;
  /**
   * 此連線的 `export` 會產出的 R2 暫存格式，讓呼叫端用對的 DuckDB 讀取器：
   * `parquet` → `read_parquet`，`ndjson` → `read_json_auto`。SQL 與 ClickHouse 匯出
   * Parquet；**BigQuery 匯出 NDJSON**（其 REST API 回傳 JSON，不是 Parquet 位元組）。
   * 不可匯出時為 `null`。
   */
  exportFormat: 'parquet' | 'ndjson' | null;
}

/**
 * 替工作區的連線目錄標註每條連線有沒有 `export` 方法（也就是能否供 R2 暫存的分析使用）。
 * 純函式、可單元測驗證。
 */
export function annotateWarehouseConnections(
  summaries: ReadonlyArray<{ id: string; name: string; type: string; displayName: string }>,
): WarehouseConnection[] {
  return summaries.map((c) => {
    // BigQuery 暫存 NDJSON（其 REST API 沒有 Parquet）；SQL 與 ClickHouse 暫存 Parquet。
    // 要與各 MCP 模組的 `export` 實作保持同步。
    const exportFormat: 'parquet' | 'ndjson' | null = isBigQueryMcpIntegration(c.type)
      ? 'ndjson'
      : isSqlDatabaseMcpIntegration(c.type) || isClickHouseMcpIntegration(c.type)
        ? 'parquet'
        : null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      displayName: c.displayName,
      exportable: exportFormat !== null,
      exportFormat,
    };
  });
}

/**
 * 在 Python 碼前加上 `params` 字典，讓呼叫端寫 `params["r2_key"]`，而不是把值插進
 * 命令字串。值以 JSON 字串嵌入、再用 `json.loads` 解析，因此任意內容（特殊字元、引號）
 * 都安全。純函式。
 */
export function withWarehouseParams(code: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return code;
  // 雙重編碼：內層產生 JSON，外層產生它的 Python 字串字面量。
  const literal = JSON.stringify(JSON.stringify(params));
  return `import json as _wh_json\nparams = _wh_json.loads(${literal})\ndel _wh_json\n${code}`;
}

/** 部署端應用程式綁定帶入的範圍屬性（props 於平台端烤進綁定）。 */
interface WarehouseServiceProps {
  workspaceId: string;
  orgId: string;
}

/**
 * 佔位服務類別。型別上仍是 Worker entrypoint（讓 index.ts 的再匯出與已部署應用程式
 * 烤死的 `WAREHOUSE` 綁定名稱有對應實作），但 Free Tier 沒有分析容器與 R2 倉儲：
 * 執行程式碼或列連線都會明確失敗，HTTP 呼叫回 501。
 */
export class WarehouseService extends WorkerEntrypoint<Env, WarehouseServiceProps> {
  async fetch(_request: Request): Promise<Response> {
    return new Response('Free Tier：倉儲 / 分析容器功能已移除', { status: 501 });
  }

  /** 在工作區的 sandbox 裡執行 Python（需容器與 R2 匯出掛載）。 */
  async runCode(_request: WarehouseRunRequest): Promise<WarehouseRunResult> {
    throw new Error(FREE_TIER_WAREHOUSE_ERROR);
  }

  /** 工作區連線目錄（需分析容器供 R2 暫存）。 */
  async listConnections(): Promise<WarehouseConnection[]> {
    throw new Error(FREE_TIER_WAREHOUSE_ERROR);
  }
}

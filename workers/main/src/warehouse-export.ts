/**
 * 倉儲匯出（warehouse export）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定，本檔僅保留型別介面
 * 與「純字串」的 key 產生器（不含任何儲存實作），讓仍參照本模組的檔案可以通過
 * 型別檢查；實際呼叫需要 R2 的函式會拋出明確錯誤。
 *
 * 原始設計：連線的 `export` 方法會把查詢結果暫存到 R2（倉儲前綴底下），
 * 再由分析容器以唯讀掛載讀取。Free Tier 沒有這條路徑。
 */
import type { SqlDatabaseClient } from './sql-database-mcp.js';

/** 用於 R2 暫存 key 的穩定非加密雜湊（快取身分識別，不具安全性）。 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 把工作區 / 連線名稱轉成可安全放进 key 的短 slug。 */
function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

export type WarehouseExportFormat = 'parquet' | 'ndjson';

/**
 * 某工作區倉儲匯出的 key 前綴（純字串）。
 *
 * 原實作中容器只掛載這個前綴（唯讀），因此工作區彼此看不見對方的物件；
 * Free Tier 沒有容器與 R2，這裡只保留前綴計算供呼叫端做一致性檢查。
 */
export function warehouseWorkspacePrefix(workspaceId: string): string {
  return `warehouse/${slug(workspaceId)}`;
}

/**
 * (工作區, 連線, 查詢) 的確定性匯出 key（純字串）。
 *
 * 相同輸入 → 相同 key，因此重複匯出會覆寫同一個物件。
 * `connectionId` 必須是整合紀錄的唯一 id，不是顯示名稱：不同類型的整合可能同名，
 * 用名稱當 key 會互相覆寫、讀到對方的資料。
 */
export function warehouseExportKey(
  workspaceId: string,
  connectionId: string,
  sql: string,
  format: WarehouseExportFormat = 'parquet',
): string {
  return `${warehouseWorkspacePrefix(workspaceId)}/${slug(connectionId)}/${fnv1a(sql)}.${format}`;
}

/**
 * 把已解析的 SQL 連線 client 對應到引擎與 `/query` 表單的匯出 request body。
 * 純函式，不含任何儲存或容器行為。
 */
export function sqlClientToExportBody(
  client: SqlDatabaseClient,
  sql: string,
): { engine: 'mysql' | 'postgres'; body: Record<string, unknown> } {
  const base: Record<string, unknown> = {
    mode: 'read',
    host: client.host,
    port: client.port,
    user: client.username,
    password: client.password,
    database: client.database,
    query: sql,
  };
  return client.type === 'postgres'
    ? { engine: 'postgres', body: { ...base, sslmode: client.sslMode } }
    : { engine: 'mysql', body: { ...base, tls: client.tls } };
}

/** 規劃好的匯出：使用哪個引擎、匯出 request body，以及 R2 暫存 key。 */
export interface SqlExportPlan {
  engine: 'mysql' | 'postgres';
  body: Record<string, unknown>;
  r2Key: string;
}

/**
 * 為 SQL 連線建立完整匯出規劃（request body + R2 暫存 key）。
 * 純計算；原實作由 db-query sandbox 實際執行並把 Parquet 寫進 `r2Key`。
 */
export function buildSqlExportPlan(
  workspaceId: string,
  connectionId: string,
  client: SqlDatabaseClient,
  sql: string,
): SqlExportPlan {
  const { engine, body } = sqlClientToExportBody(client, sql);
  return { engine, body, r2Key: warehouseExportKey(workspaceId, connectionId, sql, 'parquet') };
}

/**
 * 把匯出串流寫進倉儲 R2 暫存桶。
 *
 * Free Tier 沒有 R2 倉儲桶綁定，因此只保留簽名；呼叫必定拋出明確錯誤
 * （呼叫端 bigquery-mcp.ts / clickhouse-mcp.ts 在 Free Tier 也不會帶有
 * WAREHOUSE_EXPORT_BUCKET 綁定，會先在那一層回報 501）。
 */
export async function stageWarehouseExport(
  _bucket: R2Bucket,
  _key: string,
  _body: ReadableStream<Uint8Array> | null,
  _format: WarehouseExportFormat,
): Promise<{ ok: true; r2_key: string }> {
  throw new Error('Free Tier：已移除 R2 倉儲暫存（warehouse export）');
}

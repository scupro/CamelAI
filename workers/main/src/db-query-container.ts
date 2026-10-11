/**
 * SQL 查詢容器（DbQueryContainer）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定，本檔僅保留型別介面
 * （讓 DurableObjectNamespace<DbQueryContainer> 的宣告與 index.ts 的再匯出能通過
 * 型別檢查），實際呼叫會拋出明確錯誤或回傳 501。
 *
 * 原始實作：每個工作區一個常溫容器，內含 node 與 pg/mysql2/mssql/socks 驅動，
 * 由 db-query-service.ts 以單次 `exec` 執行內嵌的 runner，並可用 cloudflared
 * 轉發器取得固定出口 IP。
 */
import { DurableObject } from 'cloudflare:workers';
import type {
  DbQueryContainerStub,
  DbRelayForwarderConfig,
  DbRunnerOutput,
} from './db-query-service.js';
import type { Env } from './types.js';

/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_CONTAINER_ERROR = 'Free Tier：已移除 SQL 查詢容器（DbQueryContainer）';

/**
 * 佔位容器類別。型別上是 Durable Object（保留品牌型別，供命名參照使用），
 * 但 Free Tier 沒有容器綁定，任何操作都會明確失敗。
 */
export class DbQueryContainer extends DurableObject<Env> implements DbQueryContainerStub {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('Free Tier：容器功能已移除', { status: 501 });
  }

  async start(): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async startRelayForwarder(_relay: DbRelayForwarderConfig): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async relayForwarderReady(): Promise<boolean> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async runRunner(_env: Record<string, string>, _timeoutMs: number): Promise<DbRunnerOutput> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async prepareWarehouseExport(_prefix: string): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async publishWarehouseExport(_prefix: string, _exportPath: string): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  async destroy(_reason?: { operation: string; error?: string }): Promise<{ destroyed: boolean }> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }
}

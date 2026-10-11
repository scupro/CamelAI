/**
 * 應用截圖擷取 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import type { WorkspaceAppFetcherEnv, WorkspaceAppContext } from './workspace-app-fetcher.js';

export interface CaptureAppScreenshotParams {
  targetUrl: string;
  logContext: Record<string, unknown>;
  useDispatchInterception: boolean;
  postLoadInterception?: boolean;
  postLoadDelayMs?: number;
  width?: number;
  height?: number;
  fullPage?: boolean;
  timeoutMs?: number;
}

/** Free Tier 已移除 BROWSER 綁定，任何截圖請求都明確失敗。 */
export async function captureAppScreenshotBuffer(
  _browserBinding: Fetcher,
  _env: WorkspaceAppFetcherEnv,
  _context: WorkspaceAppContext,
  _params: CaptureAppScreenshotParams,
): Promise<Uint8Array> {
  throw new Error('Free Tier：已移除瀏覽器渲染截圖（BROWSER）');
}

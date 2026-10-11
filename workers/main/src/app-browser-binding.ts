/**
 * 應用瀏覽器綁定 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './types.js';

const REMOVED = 'Free Tier：已移除瀏覽器渲染綁定（BROWSER）';

export class AppBrowserBinding extends WorkerEntrypoint<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response(REMOVED, { status: 501 });
  }
}

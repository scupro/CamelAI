/**
 * Discord OAuth 整合路由 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import type { RouteContext } from '../types.js';
import { text } from '../helpers/response.js';

const REMOVED = 'Free Tier：已移除 Discord 整合（需要 queues / 服務綁定）';

export async function handleDiscordOAuthStart(_ctx: RouteContext): Promise<Response> {
  return new Response(REMOVED, { status: 501 });
}

export async function handleDiscordOAuthCallback(_ctx: RouteContext): Promise<Response> {
  return new Response(REMOVED, { status: 501 });
}

export function discordOAuthCallbackUrl(url: URL): string {
  return `${url.origin}/api/integrations/discord/callback`;
}

export { text };

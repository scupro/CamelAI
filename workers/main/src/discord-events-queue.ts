/**
 * Discord 事件佇列 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import type { Env } from './types.js';
import type { DiscordEventQueueMessage } from './discord-types.js';

/** Free Tier 已移除 queues 綁定：僅 ack，不做任何投遞。 */
export async function handleDiscordEventsQueue(
  batch: MessageBatch<DiscordEventQueueMessage>,
  _env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    message.ack();
  }
}

/** Free Tier 已移除 queues 綁定：死信佇列同樣僅 ack。 */
export async function handleDiscordEventsDeadLetterQueue(
  batch: MessageBatch<DiscordEventQueueMessage>,
  _env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    message.ack();
  }
}

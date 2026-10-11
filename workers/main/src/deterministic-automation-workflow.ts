/**
 * 確定性自動化 Workflow —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import type { Env } from './types.js';

// Workflow 綁定已從 Free Tier 移除；這裡只做符號再匯出，讓 index.ts 的
// 「Re-exports for wrangler」維持可解析。
export { DynamicWorkflowBinding } from '@cloudflare/dynamic-workflows';

export class DeterministicAutomationWorkflow extends WorkflowEntrypoint<Env, unknown> {
  override async run(_event: WorkflowEvent<unknown>, _step: WorkflowStep): Promise<unknown> {
    throw new Error('Free Tier：已移除 Workflows（確定性自動化）');
  }
}

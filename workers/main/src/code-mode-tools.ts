/**
 * 程式碼執行工具（code mode tools） —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';

const REMOVED = 'Free Tier：已移除容器／sandbox，程式碼執行工具不可用';

export interface CodeModeToolsProps {
  orgId: string;
  workspaceId: string;
  threadId?: string;
  userId?: string;
  parentToolUseId?: string;
  preconfirmed?: boolean;
}

export interface CodeModeToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
  category: string;
  examples: string[];
  sideEffect: boolean;
  externalDelivery: boolean;
  hidden: boolean;
}

/** Free Tier：無任何容器型工具可暴露。 */
export const CODE_MODE_TOOL_DEFINITIONS: CodeModeToolDefinition[] = [];

/** Free Tier：無 Pi 直傳工具。 */
export const CODE_MODE_PI_PASSTHROUGH_TOOL_DEFINITIONS: CodeModeToolDefinition[] = [];

export const CODE_MODE_COMPATIBILITY_DATE = "2026-05-11";
export const CODE_MODE_MAX_TIMEOUT_MS = 600_000;
export const CODE_MODE_DEFAULT_TIMEOUT_MS = CODE_MODE_MAX_TIMEOUT_MS;
export const CODE_MODE_DEFAULT_MAX_OUTPUT_CHARACTERS = 60_000;
export const CODE_MODE_MAX_OUTPUT_CHARACTERS = 200_000;

export function clampCodeModeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function truncateCodeModeText(value: unknown, maxCharacters: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length <= maxCharacters ? text : text.slice(0, maxCharacters) + '\n…（已截斷）';
}

export class CodeModeToolsBinding extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response(REMOVED, { status: 501 });
  }

  async callToolEnvelope(_name: string, _args: unknown): Promise<never> {
    throw new Error(REMOVED);
  }

  async describeDestructiveConfirmation(_name: string, _args: unknown): Promise<null> {
    return null;
  }
}

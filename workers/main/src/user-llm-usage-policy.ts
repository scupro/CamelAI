/**
 * Free Tier stub：使用者 LLM 用量限額檢查。
 *
 * 用量限額與計費控管已從 Free Tier 移除，原本的實作模組跟著刪除，
 * 但下層程式（agent-runtime/run-gates.ts、agent-runtime/thread-runtime.ts、
 * ai-virtual-binding.ts）仍然 import 本檔，因此保留呼叫端需要的符號與型別：
 * - UserLlmUsageLimitErrorCode 與 UserLlmUsageLimitError 沿用原版定義（Free Tier 不會拋出）；
 * - UserLlmUsagePolicyStub／UserLlmUsagePolicyContext 維持原介面，供呼叫端推導參數型別；
 * - assertUserLlmUsageAccess 保留呼叫端使用的引數，回傳 undefined 代表放行，
 *   不拋錯、不阻擋任何模型呼叫。
 * 註：原版的記錄觀測事件與限額比對邏輯一併移除，只依賴仍然存在的用量型別模組。
 */
import type {
  CheckUserLlmUsageAccessInput,
  UserLlmUsageAccessResult,
  UserLlmUsageLimitStatus,
} from "./identity/org/usage-controls.js";
import type { ObservabilityEnv } from "./observability.js";

export type UserLlmUsageLimitErrorCode =
  | "limit_exceeded"
  | "pricing_unavailable"
  | "usage_policy_unavailable";

function windowLabel(limit: UserLlmUsageLimitStatus | null): string {
  if (!limit) return "設定的滾動時間窗口";
  return limit.label?.trim() || `${limit.window_hours} 小時的時間窗口`;
}

/**
 * 用量限額相關的錯誤類別。Free Tier 不做限額阻擋，因此不會被拋出；
 * 這個類別只保留給呼叫端辨識錯誤形態（instanceof 檢查）與訊息格式使用。
 */
export class UserLlmUsageLimitError extends Error {
  constructor(
    readonly code: UserLlmUsageLimitErrorCode,
    readonly access: UserLlmUsageAccessResult | null = null,
    readonly provider?: string,
    readonly model?: string,
  ) {
    const blocking = access?.blocking_limit ?? null;
    let message: string;
    if (code === "limit_exceeded") {
      const retry = blocking?.retry_at_ms
        ? ` 請於 ${new Date(blocking.retry_at_ms).toISOString()} 之後再試。`
        : "";
      message = `已達到 LLM 用量上限（${windowLabel(blocking)}：已使用 ${(blocking?.spent_usd ?? 0).toFixed(6)} 美元／上限 ${(blocking?.limit_usd ?? 0).toFixed(6)} 美元）。${retry}`;
    } else if (code === "pricing_unavailable") {
      message = `無法取得 ${provider || "此供應商"}／${model || "此模型"} 的定價資訊，因此用量政策無法判定。請由管理者在管理 API 設定準確的定價覆寫。`;
    } else {
      message = "無法確認 LLM 用量政策，尚未呼叫供應商。請稍後重試，或請管理者檢查組織的用量服務。";
    }
    super(message);
    this.name = "UserLlmUsageLimitError";
  }
}

/** 呼叫端傳入的 DO stub 介面：只要具備用量限額檢查方法即可。 */
export interface UserLlmUsagePolicyStub {
  checkUserLlmUsageAccess(input: CheckUserLlmUsageAccessInput): Promise<UserLlmUsageAccessResult>;
}

export interface UserLlmUsagePolicyContext {
  env?: ObservabilityEnv;
  orgId: string;
  workspaceId?: string | null;
  threadId?: string | null;
  userId: string;
  provider: string;
  model: string;
}

/**
 * Free Tier 一律放行：不做用量限額阻擋，因此不查詢限額、不拋出錯誤，
 * 直接回傳 undefined（原本的呼叫端不會使用回傳值）。
 */
export async function assertUserLlmUsageAccess(
  stub: UserLlmUsagePolicyStub,
  context: UserLlmUsagePolicyContext,
): Promise<UserLlmUsageAccessResult | undefined> {
  void stub;
  void context;
  return undefined;
}

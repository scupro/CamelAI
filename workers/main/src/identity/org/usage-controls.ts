/**
 * Free Tier stub：組織用量限額與計費控管。
 *
 * Free Tier 已移除用量限額／計費控管功能，原本的實作模組也一併刪除，
 * 但下層程式（identity/org-do.ts、routes/admin/routes.ts）仍然 import 本檔，
 * 因此這裡保留完整的符號與型別清單，讓編譯期介面維持相容：
 * - 純型別（export type／export interface）與純數值常數沿用原始定義；
 * - normalizeUsageKind／normalizeUsageSurface 只做字串比對，照抄原實作；
 * - OrgUsageControls 的每個方法都改為 Free Tier 放行語意：
 *   檢查型方法回傳「允許、無限制」結果，寫入型方法回傳空值或零值且不拋錯，
 *   完全不存取資料庫、不交易、不查詢模型定價。
 * - 與 SQL、Stripe、模型定價目錄綁定的實作（resolveStrictUsageCost、
 *   usdToMicrousd 的嚴格校驗、cursor 編解碼等）不再保留；
 *   validateUserLlmUsageCursor 留作不做事用的佔位，維持呼叫端可用。
 */
import { usageInteger } from "../usage.js";

export const MICRO_USD_PER_USD = 1_000_000;
export const MAX_USER_LLM_LIMITS = 10;
export const MIN_LIMIT_WINDOW_MS = 60_000;
export const MAX_LIMIT_WINDOW_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export type UsageKind =
  | "llm"
  | "image"
  | "audio"
  | "capability"
  | "unknown";

export type UsageSurface =
  | "agent"
  | "subagent"
  | "compaction"
  | "virtual_ai"
  | "auxiliary"
  | "capability"
  | "unknown";

export type UsageCostSource =
  | "provider_reported"
  | "org_override"
  | "builtin_pricing"
  | "legacy_estimate"
  | "unpriced";

export interface UserLlmUsageLimitInput {
  window_hours: number;
  limit_usd: number;
  label?: string | null;
}

export interface UserLlmUsageLimit {
  window_hours: number;
  limit_usd: number;
  label: string | null;
}

export interface UserLlmUsageLimitStatus extends UserLlmUsageLimit {
  spent_usd: number;
  remaining_usd: number;
  unpriced_requests: number;
  exceeded: boolean;
  retry_at_ms: number | null;
}

export type UserLlmUsageAccessReason =
  | "no_limits"
  | "within_limits"
  | "limit_exceeded"
  | "pricing_unavailable";

export interface UserLlmUsageAccessResult {
  allowed: boolean;
  reason: UserLlmUsageAccessReason;
  evaluated_at_ms: number;
  blocking_limit: UserLlmUsageLimitStatus | null;
  limits: UserLlmUsageLimitStatus[];
}

export interface CheckUserLlmUsageAccessInput {
  user_id: string;
  provider: string;
  model: string;
  now_ms?: number;
}

export interface LlmModelPricingInput {
  provider: string;
  model: string;
  input_usd_per_million: number;
  output_usd_per_million: number;
  cache_creation_usd_per_million?: number;
  cache_read_usd_per_million?: number;
}

export interface LlmModelPricing extends LlmModelPricingInput {
  cache_creation_usd_per_million: number;
  cache_read_usd_per_million: number;
}

export interface LlmPricingResponse {
  org_id: string;
  prices: LlmModelPricing[];
  unpriced_models: Array<{
    provider: string;
    model: string;
    last_seen_at_ms: number;
  }>;
}

export interface UsageAggregateQuery {
  from?: number | null;
  to?: number | null;
  chargeable_only?: boolean | number | null;
  user_id?: string | null;
  provider?: string | null;
  model?: string | null;
  usage_kind?: UsageKind | null;
  usage_surface?: UsageSurface | null;
}

export interface UsageAggregateResult {
  org_id: string;
  total_cost_usd: number;
  metered_cost_usd: number;
  unpriced_requests: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_input_tokens: number;
  total_cache_read_input_tokens: number;
}

export interface UserLlmUsageReportQuery {
  from: number;
  to: number;
  limit?: number | null;
  cursor?: string | null;
  user_id?: string | null;
  now_ms?: number | null;
}

export interface UserLlmUsageTotals {
  requests: number;
  spend_usd: number;
  unpriced_requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface UserLlmUsageModelTotals extends UserLlmUsageTotals {
  provider: string;
  model: string;
}

export interface UserLlmUsageSubject {
  user_id: string | null;
  membership_status: "current" | "former" | "unattributed";
  totals: UserLlmUsageTotals;
  models: UserLlmUsageModelTotals[];
  limit_status: Pick<
    UserLlmUsageAccessResult,
    "allowed" | "reason" | "blocking_limit" | "limits"
  >;
}

export interface UserLlmUsageReport {
  org_id: string;
  from_ms: number;
  to_ms: number;
  evaluated_at_ms: number;
  users: UserLlmUsageSubject[];
  count: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface StrictUsageCostInput {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  reported_cost_usd?: number | null;
  upstream_inference_cost_usd?: number | null;
}

export interface StrictUsageCostResult {
  meteredCostMicrousd: number | null;
  costSource: UsageCostSource;
}

/**
 * 用量控管的參數校驗錯誤。
 * Free Tier 不再做限額與定價校驗，因此這個類別只在呼叫端需要辨識錯誤型態時存在。
 */
export class UsageControlsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageControlsValidationError";
  }
}

/** 建立 OrgUsageControls 時帶入的相依介面，簽名與原版相同（stub 不會真的使用）。 */
export interface UsageControlsContext {
  sql: SqlStorage;
  orgId(): string;
  isCurrentMember(userId: string): boolean;
  transactionSync<T>(callback: () => T): T;
}

/** 微美元（microusd）與美元之間的純換算，不做嚴格校驗。 */
export function microusdToUsd(value: number): number {
  return Number(
    (Math.max(0, Number(value) || 0) / MICRO_USD_PER_USD).toFixed(6),
  );
}

export function normalizeUsageKind(value: unknown): UsageKind {
  return value === "llm" || value === "image" || value === "audio" ||
    value === "capability" ? value : "unknown";
}

export function normalizeUsageSurface(value: unknown): UsageSurface {
  return value === "agent" || value === "subagent" || value === "compaction" ||
    value === "virtual_ai" || value === "auxiliary" || value === "capability"
    ? value
    : "unknown";
}

/** Free Tier 沒有用量限額，也沒有游標需要解碼：保留佔位並一律視為有效。 */
export function validateUserLlmUsageCursor(value: string): void {
  void value;
}

/**
 * 用量限額與定價控管的 Free Tier 佔位實作。
 * 所有方法都放行：讀取回傳空值或零值、寫入不做事、檢查一律 allowed。
 */
export class OrgUsageControls {
  constructor(private readonly context: UsageControlsContext) {}

  getUserLimits(userId: string): UserLlmUsageLimit[] {
    void userId;
    return [];
  }

  replaceUserLimits(
    userId: string,
    limits: UserLlmUsageLimitInput[],
    updatedBy: string,
  ): UserLlmUsageLimit[] {
    void userId;
    void limits;
    void updatedBy;
    return [];
  }

  clearUserLimits(userId: string): void {
    void userId;
  }

  getPricing(): LlmPricingResponse {
    return { org_id: this.currentOrgId(), prices: [], unpriced_models: [] };
  }

  replacePricing(
    inputs: LlmModelPricingInput[],
    updatedBy: string,
  ): LlmPricingResponse {
    void inputs;
    void updatedBy;
    return this.getPricing();
  }

  /** Free Tier 不做嚴格計費核算：一律視為未定價，不產生計費金額。 */
  resolveStrictCost(input: StrictUsageCostInput): StrictUsageCostResult {
    void input;
    return { meteredCostMicrousd: null, costSource: "unpriced" };
  }

  checkAccess(input: CheckUserLlmUsageAccessInput): UserLlmUsageAccessResult {
    return this.allowedResult(input.now_ms);
  }

  getLimitStatus(userId: string, nowMs = Date.now()): UserLlmUsageAccessResult {
    void userId;
    return this.allowedResult(nowMs);
  }

  getAggregate(query: UsageAggregateQuery = {}): UsageAggregateResult {
    void query;
    return {
      org_id: this.currentOrgId(),
      total_cost_usd: 0,
      metered_cost_usd: 0,
      unpriced_requests: 0,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_creation_input_tokens: 0,
      total_cache_read_input_tokens: 0,
    };
  }

  getUserReport(query: UserLlmUsageReportQuery): UserLlmUsageReport {
    return {
      org_id: this.currentOrgId(),
      from_ms: usageInteger(query.from),
      to_ms: usageInteger(query.to),
      evaluated_at_ms: usageInteger(query.now_ms) || Date.now(),
      users: [],
      count: 0,
      has_more: false,
      next_cursor: null,
    };
  }

  /** 組織 id 只用於填回傳值；stub 不會存取任何資料。 */
  private currentOrgId(): string {
    return this.context?.orgId() ?? "";
  }

  /** Free Tier 一律放行：無限額、無阻擋。 */
  private allowedResult(nowMs?: number | null): UserLlmUsageAccessResult {
    return {
      allowed: true,
      reason: "no_limits",
      evaluated_at_ms: usageInteger(nowMs) || Date.now(),
      blocking_limit: null,
      limits: [],
    };
  }
}

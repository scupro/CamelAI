// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
//
// 本模組不再連線 Stripe、不再扣抵額度、也不再判斷訂閱是否到期。
// 保留的原因：既有前端與路由仍 import 這些符號，因此這裡只提供
// 型別定義與安全預設實作（一律視為可正常使用，不做任何阻擋）。

import type { BillingPlan, BillingStatus, Organization } from "@/types";
import {
  normalizeBillingPlan,
  normalizeSeatCount,
} from "@/lib/billing-plans";

/** Free Tier：僅保留常數名稱，值不再對應真實 Stripe API 版本。 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** Free Tier：原本指向 Durable Object／KV 的欄位改以 unknown 表示，避免依賴已刪除的模組。 */
export interface StripeBillingEnv {
  ORG?: unknown;
  APP_KV?: unknown;
  STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET_NEXT?: string;
  STRIPE_SUBSCRIPTION_PRICE_ID?: string;
  STRIPE_STARTER_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_TEAM_PRICE_ID?: string;
  STRIPE_CREDIT_PRICE_ID?: string;
  STRIPE_CREDIT_PRICE_IDS?: string;
  BILLING_TRIAL_CREDIT_CENTS?: string;
  BILLING_SUBSCRIPTION_INCLUDED_CREDIT_CENTS?: string;
  CF_ACCOUNT_ID?: string;
  CF_DISPATCH_NAMESPACE?: string;
}

export type BillingPortalMode = "management" | "upgrade" | "downgrade";

/** Free Tier：保留型別外形，僅供計費相關程式碼通過型別檢查。 */
export interface StripeCustomer {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer?: string | StripeCustomer | null;
  metadata?: Record<string, string>;
  quantity?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  cancel_at?: number | null;
  canceled_at?: number | null;
  cancel_at_period_end?: boolean | null;
}

export interface OrgBillingAccessSnapshot {
  org_id: string;
  billing_status: BillingStatus;
  billing_plan: BillingPlan;
  billing_seat_count: number;
  billing_subscription_status: string | null;
  billing_trial_started_at: number | null;
  billing_trial_ends_at: number | null;
  billing_credit_purchase_total_cents: number;
  billing_credit_grant_total_cents: number;
  billing_trial_credit_grant_cents: number;
  billing_trial_credit_granted_at: number | null;
  billing_free_credit_grant_cents: number;
  billing_free_credit_granted_at: number | null;
  billing_last_included_credit_invoice_id: string | null;
  billing_credit_usage_started_at: number | null;
}

export interface OrgBillingOverview extends OrgBillingAccessSnapshot {
  lifetime_spend_cents: number;
  chargeable_usage_cents: number;
  chargeable_request_count: number;
  available_credits_cents: number;
  total_credit_limit_cents: number;
  trial_credit_allowance_cents: number;
  subscription_included_credit_cents: number;
}

export type OrgBillingAccessState =
  | {
      kind: "ready";
      mode:
        | "enterprise"
        | "subscription"
        | "byok"
        | "credits"
        | "camel_free"
        | "selfhost";
      setupRouteAccessible: true;
    }
  | {
      kind: "setup_required";
      reason: "missing_llm_provider";
      setupRouteAccessible: boolean;
    };

const BILLING_SETUP_PATHS = new Set([
  "/settings/organization/billing",
  "/settings/organization/usage",
]);

export function isBillingSetupPath(pathname: string): boolean {
  return BILLING_SETUP_PATHS.has(pathname);
}

export function isOrgBillingAccessReady(
  access: OrgBillingAccessState,
): access is Extract<OrgBillingAccessState, { kind: "ready" }> {
  return access.kind === "ready";
}

/**
 * Free Tier：不做計費存取判斷，一律回傳可直接使用的工作區狀態。
 * 參數維持原有呼叫端傳入的外形（org、llmProviderConfig、pathname、env），
 * 但不予消費，因此任何來源的 org 形狀都能通過型別檢查。
 */
export function resolveOrgBillingAccess(args: {
  org: unknown;
  llmProviderConfig?: unknown;
  pathname?: string;
  env?: unknown;
}): OrgBillingAccessState {
  void args;
  return { kind: "ready", mode: "byok", setupRouteAccessible: true };
}

function normalizeBillingStatus(
  status: string | null | undefined,
): BillingStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "enterprise":
    case "past_due":
    case "canceled":
      return status;
    case "paying":
      return "active";
    default:
      return "inactive";
  }
}

/** 由 org 記錄組出計費快照；Free Tier 只是讀取欄位，不做任何計費運算。 */
export function getBillingAccessSnapshotForOrg(
  org: Organization,
): OrgBillingAccessSnapshot {
  const billingStatus = normalizeBillingStatus(org.billing_status);
  const billingPlan = normalizeBillingPlan(org.billing_plan, org.billing_status);

  return {
    org_id: org.id,
    billing_status: billingStatus,
    billing_plan: billingPlan,
    billing_seat_count: normalizeSeatCount(billingPlan, org.billing_seat_count),
    billing_subscription_status: org.billing_subscription_status ?? null,
    billing_trial_started_at: org.billing_trial_started_at ?? null,
    billing_trial_ends_at: org.billing_trial_ends_at ?? null,
    billing_credit_purchase_total_cents:
      org.billing_credit_purchase_total_cents ?? 0,
    billing_credit_grant_total_cents: org.billing_credit_grant_total_cents ?? 0,
    billing_trial_credit_grant_cents: org.billing_trial_credit_grant_cents ?? 0,
    billing_trial_credit_granted_at: org.billing_trial_credit_granted_at ?? null,
    billing_free_credit_grant_cents: org.billing_free_credit_grant_cents ?? 0,
    billing_free_credit_granted_at: org.billing_free_credit_granted_at ?? null,
    billing_last_included_credit_invoice_id:
      org.billing_last_included_credit_invoice_id ?? null,
    billing_credit_usage_started_at: org.billing_credit_usage_started_at ?? null,
  };
}

/**
 * Free Tier：用量與額度不再計算，可用額度以最大值回報，
 * 確保前端不會因「額度用盡」而阻擋模型使用。
 */
export async function getOrgBillingOverview(
  env: unknown,
  org: Organization,
): Promise<OrgBillingOverview> {
  void env;
  const snapshot = getBillingAccessSnapshotForOrg(org);
  const unlimitedCreditsCents = Number.MAX_SAFE_INTEGER;

  return {
    ...snapshot,
    lifetime_spend_cents: 0,
    chargeable_usage_cents: 0,
    chargeable_request_count: 0,
    available_credits_cents: unlimitedCreditsCents,
    total_credit_limit_cents: unlimitedCreditsCents,
    trial_credit_allowance_cents: 0,
    subscription_included_credit_cents: 0,
  };
}

/** Free Tier：沒有 Stripe 環境，任何入口都不該顯示需付費的操作。 */
export function isStripeBillingConfigured(env: unknown): boolean {
  void env;
  return false;
}

/** Free Tier：訂閱變更入口已移除，呼叫即明確失敗。 */
export async function createSubscriptionUpdatePortalSession(args: any): Promise<
  string | null
> {
  void args;
  throw new Error("Free Tier：已移除 Stripe 訂閱功能");
}

/** Free Tier：建立訂閱結帳流程的功能已移除，呼叫即明確失敗。 */
export async function createSubscriptionCheckoutSession(args: any): Promise<
  string
> {
  void args;
  throw new Error("Free Tier：已移除 Stripe 訂閱功能");
}

/** Free Tier：不再與 Stripe 同步訂閱狀態，直接回報「查無對應組織」。 */
export async function syncOrgSubscriptionFromStripe(
  env: unknown,
  subscription: StripeSubscription,
): Promise<Organization | null> {
  void env;
  void subscription;
  return null;
}

/**
 * Free Tier：不刪除任何 Stripe 資料（非破壞性 no-op），
 * 僅原樣回傳 org，讓管理工具的快照介面照常可用。
 */
export async function deleteStripeTestCustomerForOrg(
  env: unknown,
  org: Organization,
): Promise<{
  subscription_deleted: boolean;
  customer_deleted: boolean;
  org: Organization;
}> {
  void env;
  return {
    subscription_deleted: false,
    customer_deleted: false,
    org,
  };
}

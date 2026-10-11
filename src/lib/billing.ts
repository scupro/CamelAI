// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
//
// 這裡只留下純格式化與標籤函式（前端仍會 import），
// 涉及「是否有付費權限」的判斷在 Free Tier 一律回傳 true。

import type { BillingStatus, Organization } from "@/types";

/** Free Tier：不做付費判斷，一律視為啟用。 */
export function isBillingActive(
  status: BillingStatus | null | undefined,
): boolean {
  void status;
  return true;
}

/** Free Tier：不做付費判斷，一律允許使用工作區功能。 */
export function canUsePaidWorkspace(
  status: BillingStatus | null | undefined,
): boolean {
  void status;
  return true;
}

export function billingStatusLabel(
  status: BillingStatus | null | undefined,
): string {
  switch (status) {
    case "trialing":
      return "試用中";
    case "active":
      return "生效中";
    case "enterprise":
      return "企業方案";
    case "past_due":
      return "逾期未付款";
    case "canceled":
      return "已取消";
    case "inactive":
    default:
      return "免費";
  }
}

export function billingStatusBadgeVariant(
  status: BillingStatus | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "trialing":
    case "active":
    case "enterprise":
      return "default";
    case "past_due":
      return "destructive";
    case "canceled":
      return "outline";
    case "inactive":
    default:
      return "secondary";
  }
}

export function formatCreditAmount(
  credits: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {},
): string {
  const formatter = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
  return `${formatter.format(credits)} 點額度`;
}

export function formatCreditBalance(cents: number): string {
  return formatCreditAmount(cents / 100);
}

export function formatCreditsFromUsd(
  usd: number,
  maximumFractionDigits = 4,
): string {
  return formatCreditAmount(usd, {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function getBillingStatusDescription(
  org: Pick<Organization, "billing_status">,
): string {
  switch (org.billing_status) {
    case "trialing":
      return "方案已啟用，內含額度有上限。";
    case "active":
      return "方案已啟用，並含每月額度。";
    case "enterprise":
      return "貴組織的計費於 Stripe 之外處理，不需要訂閱或額度。";
    case "past_due":
      return "付款已逾期，請完成付款以恢復進階模型。";
    case "canceled":
      return "訂閱已取消。";
    case "inactive":
    default:
      return "此環境不需要付費，可直接使用。";
  }
}

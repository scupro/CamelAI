/**
 * Free Tier stub：組織計費欄位正規化。
 *
 * 原本的計費實作已隨著計費功能移除而刪除，但下層程式
 * （identity/org-do.ts）仍然 import 本檔，因此這裡保留呼叫端需要的介面：
 * 函式名稱、參數型別與回傳型別皆維持原樣，不引用任何已刪除的模組，
 * 只依賴仍然存在的 src/types 與 src/lib/billing-plans。
 *
 * Free Tier 語意調整：
 * - 仍會把 Organization 的計費欄位補齊成安全預設值，避免下游讀到 undefined；
 * - 原回傳值代表「是否有計費欄位被改動」，Free Tier 一律回傳 false，
 *   也就是不透過這個函式觸發計費狀態的寫回。
 */
import type { Organization } from "../../../../src/types.js";
import {
  normalizeBillingPlan,
  normalizeSeatCount,
} from "../../../../src/lib/billing-plans.js";

export function normalizeOrgBillingFields(info: Organization): boolean {
  if (!info.billing_status) {
    info.billing_status = "inactive";
  }

  const subscriptionStatus = info.billing_subscription_status?.trim();
  const hasRecoverableSubscription =
    Boolean(info.billing_subscription_id?.trim()) &&
    (subscriptionStatus === "active" ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "past_due" ||
      subscriptionStatus === "unpaid" ||
      subscriptionStatus === "incomplete" ||
      subscriptionStatus === "paused");

  if (
    info.billing_status === "canceled" ||
    (info.billing_status === "inactive" && !hasRecoverableSubscription)
  ) {
    if (info.billing_status !== "inactive") {
      info.billing_status = "inactive";
    }
    if (info.billing_plan !== "payg") {
      info.billing_plan = "payg";
    }
    if (!hasRecoverableSubscription && info.billing_subscription_id !== null) {
      info.billing_subscription_id = null;
    }
    if (
      !hasRecoverableSubscription &&
      info.billing_subscription_status !== null
    ) {
      info.billing_subscription_status = null;
    }
  }

  // 只做欄位正規化，不記錄改動旗標：Free Tier 沒有計費狀態需要回寫。
  const normalizedPlan = normalizeBillingPlan(
    info.billing_plan,
    info.billing_status,
  );
  info.billing_plan = normalizedPlan;
  info.billing_seat_count = normalizeSeatCount(
    normalizedPlan,
    info.billing_seat_count,
  );

  return false;
}

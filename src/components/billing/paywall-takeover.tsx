// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

import type { BillingPlan } from "@/types";

export interface PaywallTakeoverContext {
  currentOrgName: string;
  multiOrg: boolean;
  byokProviderLabel: string | null;
}

/**
 * Free Tier：原本的 PlanPickerCta 所在模組已隨計費功能移除，
 * 這裡以本檔內最小定義取代，僅用於維持 props 外形。
 */
type PlanPickerCta = { kind: string; plan?: BillingPlan };

interface PlanPickerOverrides {
  currentPlan?: BillingPlan | null;
  defaultBillingMode?: "individual" | "team";
  disabledReason?: string | null;
  highlightedPlan?: BillingPlan | null;
}

// 保留 props 外形，讓呼叫端（_app.tsx）傳入的 paywallContext 可正常型別檢查。
interface PaywallTakeoverProps {
  paywallContext: PaywallTakeoverContext;
  currentOrgId?: string | null;
  onPreviewSelectPlan?: (cta: PlanPickerCta) => void;
  planPickerOverrides?: PlanPickerOverrides;
}

export function PaywallTakeover(props: PaywallTakeoverProps): null {
  void props;
  return null;
}

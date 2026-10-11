// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

// 保留 props 外形，讓呼叫端（team-table.tsx）的
// `onOpenChange={setUpgradeOpen}` 等傳參可通過型別檢查。
export interface TeamUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 使用者目前的方案；Free Tier 不再據此顯示升等說明。 */
  currentPlan: "free" | "starter" | "pro";
  /** 此環境是否設定 Stripe；Free Tier 一律為 false。 */
  stripeConfigured: boolean;
}

export function TeamUpgradeDialog(props: TeamUpgradeDialogProps): null {
  void props;
  return null;
}

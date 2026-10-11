// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

// 保留 props 外形，讓呼叫端（Chat.tsx、app-sidebar.tsx）的
// `onOpenChange={(open) => ...}` 與各回呼可推斷參數型別。
export interface PlanUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopUp: () => void;
  onAddKey: () => void;
  onOpenAiSignIn: () => void;
}

export function PlanUpgradeDialog(props: PlanUpgradeDialogProps): null {
  void props;
  return null;
}

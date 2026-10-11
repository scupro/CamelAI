// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

export interface TopUpDialogPack {
  id: string;
  creditsLabel: string | null;
  priceLabel: string | null;
}

// 保留 props 外形，讓呼叫端（Chat.tsx、app-sidebar.tsx）的
// `onOpenChange={(open) => ...}` 回呼可推斷參數型別。
interface TopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packs: TopUpDialogPack[];
  action?: string;
  returnTo?: string;
  loading?: boolean;
  canTopUp?: boolean;
  unavailableReason?: string | null;
}

export function TopUpDialog(props: TopUpDialogProps): null {
  void props;
  return null;
}

// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

import type { BillingCreditStatus } from "@/lib/chat-credit-status";
import type { ModelPausedReason } from "@/lib/model-picker-access";

// 保留 props 外形，讓呼叫端（Chat.tsx）傳入的回呼與選填欄位可正常推斷型別。
interface BillingCreditNoticeProps {
  status: BillingCreditStatus;
  onOpenUsage: () => void;
  onTopUp: () => void;
  canTopUp?: boolean;
  pauseReason?: ModelPausedReason | null;
  userId?: string | null;
  orgId?: string | null;
  className?: string;
}

export function BillingCreditNotice(props: BillingCreditNoticeProps): null {
  void props;
  return null;
}

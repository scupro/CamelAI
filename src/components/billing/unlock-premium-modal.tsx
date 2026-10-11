// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

import type { LlmModel } from "@/types";

export type UnlockPremiumModalVariant =
  | "unlock"
  | "payg_credits_exhausted"
  | "included_credits_exhausted"
  | "trial_credits_exhausted";

// 保留 props 外形，讓呼叫端（Chat.tsx）的
// `onOpenChange={(open) => ...}` 與各回呼可推斷參數型別。
export interface UnlockPremiumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerModel: LlmModel | null;
  isOrgAdmin: boolean;
  orgId: string;
  onSeePlans: () => void;
  onTopUp: () => void;
  onAddKey: () => void;
  onOpenAiSignIn: () => void;
  variant?: UnlockPremiumModalVariant;
}

export function UnlockPremiumModal(props: UnlockPremiumModalProps): null {
  void props;
  return null;
}

// Free Tier：已移除計費／升等流程，此模組僅保留型別與 props 介面
// 元件恆渲染 null。

import type { Workspace } from "@/types";

// 保留 props 外形，讓呼叫端（history-client.tsx）的
// `onOpenChange={(open) => ...}` 回呼可推斷參數型別。
interface ContainerLoadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  title?: string;
  description?: string;
  statusLabel?: string;
}

export function ContainerLoadingDialog(
  props: ContainerLoadingDialogProps,
): null {
  void props;
  return null;
}

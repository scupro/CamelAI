/**
 * 專案建置就緒閘道 —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

/** Free Tier 已移除建置容器；就緒閘道退化為直接執行，僅保留符號與型別。 */
export function projectBuildReadinessEventName(event: unknown): string {
  const type = (event as { type?: string } | undefined)?.type;
  return type ? `build_sandbox_${type}` : "build_sandbox_event";
}

export async function runWithProjectBuildReadiness<T>(
  _sandbox: unknown,
  run: () => Promise<T>,
  _options?: {
    operation: string;
    budgetMs?: number;
    onProgress?: (message: string) => void;
    onEvent?: (event: unknown) => void;
    deadline?: unknown;
    readiness?: unknown;
  },
): Promise<T> {
  return run();
}

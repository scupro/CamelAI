/**
 * 專案建置容器（ProjectBuildContainer）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定，本檔僅保留型別介面
 * （讓 DurableObjectNamespace<ProjectBuildContainer> 的宣告、index.ts 的再匯出，
 * 以及 project-worker-bundle.ts 的 Pick<ProjectBuildContainer, …> 能通過型別檢查），
 * 實際呼叫會拋出明確錯誤或回傳 501。
 *
 * 原始實作：每個組織一個常溫建置容器（原生 Durable Object 容器 API），
 * 只保存建置快取；原始碼由專案儲存重新_materialize_，容器遺失只損失一次冷建置。
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';

/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_CONTAINER_ERROR = 'Free Tier：已移除專案建置容器（ProjectBuildContainer）';

/** 建置工作階段保持容器溫熱的預設視窗（毫秒）。 */
export const PROJECT_BUILD_ACTIVE_SESSION_WINDOW_MS = 10 * 60_000;

export interface ProjectBuildExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** 毫秒。 */
  timeout?: number;
}

export interface ProjectBuildExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** 命令在其 `timeout` 被停止；stdout/stderr 只有部分内容。 */
  timedOut: boolean;
}

export interface ProjectBuildListedFile {
  name: string;
  type: "file" | "directory";
  relativePath: string;
  absolutePath: string;
  size: number;
}

/**
 * 佔位容器類別。型別上是 Durable Object，但 Free Tier 沒有容器綁定，
 * 任何檔案或命令操作都會明確失敗。
 */
export class ProjectBuildContainer extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('Free Tier：容器功能已移除', { status: 501 });
  }

  /** 在容器裡執行一條命令。 */
  async exec(_command: string, _options: ProjectBuildExecOptions = {}): Promise<ProjectBuildExecResult> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 建立目錄。 */
  async mkdir(_path: string, _options: { recursive?: boolean } = {}): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 寫入檔案（必要時建立父目錄）；字串預設 utf8，可指定 base64。 */
  async writeFile(
    _path: string,
    _content: string | ReadableStream<Uint8Array>,
    _options: { encoding?: "base64" | "utf8" } = {},
  ): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 檔案文字（或 base64）内容；檔案不存在時為 `null`。 */
  async readFile(_path: string, _options: { encoding?: "base64" | "utf8" } = {}): Promise<{ content: string } | null> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 整個檔案的位元組；檔案不存在時為 `null`。 */
  async readFileBytes(_path: string): Promise<Uint8Array | null> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 列出 `path` 下的檔案與目錄（含大小）。 */
  async listFiles(
    _path: string,
    _options: { recursive?: boolean; includeHidden?: boolean } = {},
  ): Promise<{ files: ProjectBuildListedFile[] }> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }

  /** 為組織的建置工作階段保持容器溫熱（只記錄，不啟動容器）。 */
  async noteBuildSessionActivity(_windowMs: number = PROJECT_BUILD_ACTIVE_SESSION_WINDOW_MS): Promise<void> {
    throw new Error(FREE_TIER_CONTAINER_ERROR);
  }
}

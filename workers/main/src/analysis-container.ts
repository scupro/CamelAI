/**
 * 分析容器（AnalysisContainer） —— Free Tier 佔位模組。
 *
 * Free Tier 已移除相關付費綁定（容器 / R2 / 佇列 / 瀏覽器渲染 / 計費），
 * 本檔僅保留「符號與型別介面」，讓仍參照本模組的程式能通過打包與型別檢查；
 * 任何實際呼叫都會拋出明確錯誤或被安全地忽略。
 */

import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './types.js';

const REMOVED = 'Free Tier：已移除分析容器（ANALYSIS_SANDBOX）';

export const ANALYSIS_CONNECTIONS_HOST = "connections.internal";

export type AnalysisAccess =
  | { readonly mode: "agent"; readonly orgId: string; readonly workspaceId: string }
  | { readonly mode: "app"; readonly workspaceId: string };

export function analysisContainerName(access: AnalysisAccess): string {
  return access.mode === "app" ? `app-${access.workspaceId}` : access.workspaceId;
}

export interface AnalysisExecOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
}

export interface AnalysisCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface AnalysisOpenedFile {
  stream: ReadableStream<Uint8Array>;
}

export interface AnalysisContainerLike {
  exec(command: string, options: AnalysisExecOptions): Promise<AnalysisCommandResult>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string | ReadableStream<Uint8Array>): Promise<void>;
  openFile(path: string): Promise<AnalysisOpenedFile>;
  removePaths(paths: string[]): Promise<void>;
}

export type AnalysisContainerStub = AnalysisContainerLike & {
  start(options?: unknown): Promise<unknown>;
  destroy(reason?: { message?: string; code?: string }): Promise<void>;
};

export function getAnalysisSandbox(
  _env: { ANALYSIS_SANDBOX?: DurableObjectNamespace<AnalysisContainer> },
  access: AnalysisAccess,
): AnalysisContainerStub {
  return getAnalysisSandboxByName(_env, analysisContainerName(access));
}

export function getAnalysisSandboxByName(
  _env: { ANALYSIS_SANDBOX?: DurableObjectNamespace<AnalysisContainer> },
  _base: string,
): AnalysisContainerStub {
  throw new Error(REMOVED);
}

export class AnalysisContainer extends DurableObject<Env> implements AnalysisContainerLike {
  async exec(_command: string, _options: AnalysisExecOptions): Promise<AnalysisCommandResult> {
    throw new Error(REMOVED);
  }
  async mkdir(_path: string): Promise<void> {
    throw new Error(REMOVED);
  }
  async writeFile(_path: string, _content: string | ReadableStream<Uint8Array>): Promise<void> {
    throw new Error(REMOVED);
  }
  async openFile(_path: string): Promise<AnalysisOpenedFile> {
    throw new Error(REMOVED);
  }
  async removePaths(_paths: string[]): Promise<void> {
    throw new Error(REMOVED);
  }
  async start(_options?: unknown): Promise<unknown> {
    throw new Error(REMOVED);
  }
  async destroy(_reason?: { message?: string; code?: string }): Promise<void> {
    throw new Error(REMOVED);
  }
}

export class AnalysisEgress extends WorkerEntrypoint<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response(REMOVED, { status: 501 });
  }
}

export class AnalysisConnectionsGateway extends WorkerEntrypoint<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response(REMOVED, { status: 501 });
  }
}

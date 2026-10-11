/**
 * 直接派發部署（direct dispatch deploy）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除部署與計費綁定：沒有 Cloudflare Workers 上傳管道（dispatch
 * namespace 的 `PUT /scripts/:name`）、沒有原生靜態資產上傳、也沒有 R2 制品快取
 * 與部署資產回收站。本檔只保留部署管線的契約型別，讓 project-worker-bundle.ts、
 * notebook-worker-bundle.ts 與 user-app-cost-controls-backfill.ts 能通過型別檢查；
 * 實際部署／回滾的函式一律拋出明確錯誤。
 *
 * 原始實作：把 Worker 模組與「依批次讀取」的靜態資產上傳到
 * `accounts/:accountId/workers/dispatch/namespaces/:ns/scripts/:scriptName`，資產
 * 另存一份到 R2 供回滾使用，上傳前後取得／釋放 app 操作租約；selfhost 模式則改寫
 * 進 APP_KV（不含 Cloudflare API）。Free Tier 沒有這些綁定，兩條路徑都不存在。
 */
import type { DeploySideEffectsInfo, WorkerBinding } from "./cf-api-proxy.js";
import type { SelfhostAssetsRecord } from "./selfhost-assets-registry.js";
import type { UserAppCostControlsEnv } from "./user-app-cost-controls.js";

/**
 * 直接部署需要的環境變數。
 *
 * Free Tier 沒有 `CF_API_TOKEN` / `CF_ACCOUNT_ID` / `CF_DISPATCH_NAMESPACE` 等
 * 部署綁定，也沒有 `R2_BUCKET`；這些欄位只維持型別形狀，實際環境永遠未設定。
 */
export interface DirectDispatchDeployEnv extends UserAppCostControlsEnv {
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_DISPATCH_NAMESPACE?: string;
  CF_WORKER_NAME?: string;
  TAIL_WORKER_NAME?: string;
  APP_KV?: KVNamespace;
  APP_DB?: D1Database;
  R2_BUCKET?: R2Bucket;
}

/** 部署歸屬識別（組織 / 工作區 / 選用的執行緒與專案）。 */
export interface DirectDispatchDeployIdentity {
  orgId: string;
  orgSlug: string;
  workspaceId: string;
  userId?: string;
  threadId?: string;
  projectId?: string;
}

/** 上傳時附帶的 Worker metadata（原樣對應 Cloudflare 的上傳 API 欄位）。 */
export interface DirectWorkerMetadata {
  main_module: string;
  bindings?: WorkerBinding[];
  compatibility_date?: string;
  compatibility_flags?: string[];
  config_path?: string;
  [key: string]: unknown;
}

/**
 * 部署資產的延遲讀取句柄：`read()` 才實際取位元組（原實作來自建置 sandbox
 * 或 R2），因此資產很多時也不會一次全部進 isolate 記憶體。
 */
export interface DirectDeployAsset {
  path: string;
  contentType?: string;
  size: number;
  read(): Promise<Uint8Array>;
}

/** 上傳的單一模組（名稱、內容類型與內容）。 */
export interface DirectWorkerModule {
  name: string;
  contentType: string;
  content: string | Uint8Array | ArrayBuffer;
}

/** 一次直接部署的請求。 */
export interface DirectDispatchDeployRequest {
  scriptName: string;
  hostname: string;
  identity: DirectDispatchDeployIdentity;
  metadata: DirectWorkerMetadata;
  modules: DirectWorkerModule[];
  assets?: DirectDeployAsset[];
  commitSha?: string;
}

/** 一次直接部署／回滾的結果。 */
export interface DirectDispatchDeployResult {
  success: boolean;
  scriptName: string;
  dispatchScriptName: string;
  status: number;
  timings?: DirectDispatchDeployTimings;
  result?: unknown;
  error?: string;
  warnings?: string[];
  skippedAssets?: DirectDeploySkippedAsset[];
  sideEffects: DeploySideEffectsInfo;
}

/** 因超過 Cloudflare 單檔上限而被跳過的靜態資產。 */
export interface DirectDeploySkippedAsset {
  path: string;
  size: number;
  limit: number;
  reason: "asset_too_large";
}

/** 部署各階段耗時與數量統計（僅供觀測）。 */
export interface DirectDispatchDeployTimings {
  totalMs: number;
  prepareAssetsMs: number;
  nativeAssetsMs: number;
  storeAssetsMs: number;
  migrationsMs: number;
  artifactCacheMs: number;
  cloudflareUploadMs: number;
  publishAssetsRecordMs: number;
  moduleCount: number;
  assetCount: number;
  moduleBytes: number;
  assetBytes: number;
}

/** 從制品快取回滾的請求。 */
export interface DirectDeployRollbackRequest {
  artifactCacheKey: string;
  hostname: string;
  expected?: {
    orgId?: string;
    workspaceId?: string;
    scriptName?: string;
  };
  threadId?: string;
}

/** 存在 R2 的部署制品（模組以 base64 保存，供回滾重傳）。 */
export interface DirectDeployArtifactCacheRecord {
  schemaVersion: 1;
  createdAt: string;
  scriptName: string;
  dispatchScriptName: string;
  identity: DirectDispatchDeployIdentity;
  metadata: DirectWorkerMetadata;
  modules: Array<{ name: string; contentType: string; contentBase64: string }>;
  assetsRecord: SelfhostAssetsRecord | null;
}

/** 部署／回滾的共用選項（fetcher 供測試注入，side effects 回呼寫註冊表）。 */
export interface DirectDispatchDeployOptions {
  fetcher?: typeof fetch;
  onDeploySideEffects?: (info: DeploySideEffectsInfo) => Promise<void>;
}

/** Free Tier 統一使用的錯誤訊息。 */
const FREE_TIER_DEPLOY_ERROR = "Free Tier：已移除直接派發部署（Workers 上傳與 R2 制品快取）";

/**
 * 上傳模組與資產到 dispatch namespace。
 *
 * Free Tier 沒有部署綁定，呼叫即錯；原實作還會批次算資產雜湊、寫 R2 回滾快取、
 * 套用成本控制（cpu_ms／alarm 上限）與 tail worker 設定。
 */
export async function deployWorkerModulesDirect(
  _env: DirectDispatchDeployEnv,
  _request: DirectDispatchDeployRequest,
  _options: DirectDispatchDeployOptions = {},
): Promise<DirectDispatchDeployResult> {
  throw new Error(FREE_TIER_DEPLOY_ERROR);
}

/**
 * 用 R2 裡的部署制品重傳同一個 app（成本控制回補與回滾走這條路）。
 *
 * Free Tier 沒有 R2 制品快取，也沒有 dispatch namespace 上傳，呼叫即錯。
 */
export async function rollbackWorkerDeployFromArtifactCache(
  _env: DirectDispatchDeployEnv,
  _request: DirectDeployRollbackRequest,
  _options: DirectDispatchDeployOptions = {},
): Promise<DirectDispatchDeployResult> {
  throw new Error(FREE_TIER_DEPLOY_ERROR);
}

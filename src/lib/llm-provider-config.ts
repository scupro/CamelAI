import type {
  LlmModel,
  LlmProvider,
  LlmProviderConfigPublic,
} from "../types";
import { decryptCredentials } from "./integration-crypto";

// Only unset models fall back to these; stored thread models and configured
// picker defaults keep their explicit choice.
export const CUSTOM_LLM_MODEL: LlmModel = "custom";
export const THREAD_MODEL_LOCK_MESSAGE =
  "This thread is locked to its original model. Start a new thread to use a different model.";

// ---------------------------------------------------------------------------
// Free Tier 模型清單
//
// 底下所有 slug 都對應供應商「目前實際提供的免費模型」。查證日期 2026-10-11，
// 來源、上下文長度與速率限制見 docs/free-models.md。
// slug → 供應商真實模型 ID 的對映在 workers/main/src/pi-model-resolution.ts。
// ---------------------------------------------------------------------------

/** 未設定 provider 時的預設：OpenRouter 免費、1M 上下文的旗艦模型。 */
export const DEFAULT_LLM_MODEL: LlmModel = "nemotron-ultra";
/** provider = openai（含 Groq 等 OpenAI 相容端點）時的預設。 */
export const DEFAULT_OPENAI_MODEL: LlmModel = "gpt-oss-120b";
export const DEFAULT_OPENROUTER_MODEL: LlmModel = "nemotron-ultra";
/**
 * Anthropic / Bedrock 沒有免費模型，因此不提供選項清單；使用這兩個 provider 時
 * 一律透過 custom_model_id 自訂模型。
 */
export const DEFAULT_ANTHROPIC_MODEL: LlmModel = CUSTOM_LLM_MODEL;

/**
 * 退役模型 → 最接近的免費替代。DB 裡已存的舊模型 ID 靠這張表轉譯，
 * 否則既有對話會拿到無效模型。
 */
const STORED_LLM_MODEL_REPLACEMENTS: Readonly<Record<string, LlmModel>> = {
  // 2026-10 全面改為免費模型時退役的 camelAI 託管／Anthropic／OpenAI／Bedrock slug
  sonnet: "nemotron-ultra",
  "haiku-5.5": "lfm-mini",
  "fable-5.1": "nemotron-ultra",
  "opus-5.5": "nemotron-ultra",
  "gpt-6.1-sol": "gpt-oss-120b",
  "gpt-6-luna": "gpt-oss-20b",
  "gpt-5.6-terra-bedrock": "gpt-oss-120b",
  "kimi-k3": "north-mini-code",
  "grok-4.7": "nemotron-ultra",
  "glm-5.3": "ling-flash",
  "glm-5.3-flash": "lfm-mini",
  "gemini-3.8-flash": "gemma-4-31b",
  "deepseek-v4-auto": "north-mini-code",
  "deepseek-v4.1-flash": "ling-flash",
  // 更早已退役的產品／供應商 ID（沿用原表，值改指向免費模型）
  "gemini-3.1-pro-preview": "gemma-4-31b",
  "gemini-3.5-flash": "gemma-4-31b",
  "gemini-3-flash-preview": "gemma-4-31b",
  "deepseek-v4-pro": "ling-flash",
  "deepseek-v4-flash": "ling-flash",
  "kimi-k2.6": "north-mini-code",
  "kimi-latest": "north-mini-code",
  "kimi-k2.7-code": "north-mini-code",
  "moonshotai/kimi-latest": "north-mini-code",
  "moonshotai/kimi-k2.6": "north-mini-code",
  "moonshotai/kimi-k2.7-code": "north-mini-code",
  "grok-4.3": "nemotron-ultra",
  "grok-latest": "nemotron-ultra",
  "grok-4.5": "nemotron-ultra",
  "x-ai/grok-4.5": "nemotron-ultra",
  "x-ai/grok-4.3": "nemotron-ultra",
  "x-ai/grok-latest": "nemotron-ultra",
  "glm-5.2": "ling-flash",
  "glm-latest": "ling-flash",
  "z-ai/glm-5.2": "ling-flash",
  "z-ai/glm-latest": "ling-flash",
  opus: "nemotron-ultra",
  "opus-4.7": "nemotron-ultra",
  "opus-4.8": "nemotron-ultra",
  "opus-5": "nemotron-ultra",
  "fable-5": "nemotron-ultra",
  "claude-fable-5": "nemotron-ultra",
  "gpt-6-sol": "gpt-oss-120b",
  "gpt-5.6-sol": "gpt-oss-120b",
  "gpt-5.6-terra": "gpt-oss-120b",
  "gpt-5.6-luna": "gpt-oss-20b",
  "gpt-5.5": "gpt-oss-120b",
  "gpt-5.4": "gpt-oss-120b",
  "gpt-5.4-mini": "gpt-oss-20b",
  haiku: "lfm-mini",
  // Anthropic 真實模型 ID（Anthropic 無免費方案）
  "claude-sonnet-5-5": "nemotron-ultra",
  "claude-opus-5-5": "nemotron-ultra",
  "claude-haiku-5-5": "lfm-mini",
  "claude-fable-5-1": "nemotron-ultra",
};

/** Bedrock 沒有免費模型；退役的 Bedrock OpenAI 模型一律轉到 Groq 免費方案。 */
const STORED_BEDROCK_OPENAI_MODELS = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.6-sol-bedrock",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.5-bedrock",
  "gpt-5.4-bedrock",
  "gpt-5.6-terra-bedrock",
]);

// When adding a model here, also add it to the picker catalog at
// src/lib/model-catalog.ts and the pricing table at src/lib/usage-pricing.ts.

/** Anthropic 沒有免費模型，故選項為空；需要時請改用 custom_model_id。 */
export const ANTHROPIC_LLM_MODEL_OPTIONS: ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> = [];

/**
 * OpenRouter 免費模型（API 回報 pricing 全為 0）。458 個模型中篩出 19 個免費，
 * 排除音樂生成（google/lyria-3-*）與純內容安全（nemotron-3.5-content-safety）
 * 後為底下 9 個。
 */
export const OPENROUTER_LLM_MODEL_OPTIONS: ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> = [
  {
    value: "nemotron-ultra",
    label: "Nemotron 3 Ultra 550B (free)",
    description: "OpenRouter 免費・1M 上下文・550B MoE，免費清單中最大",
  },
  {
    value: "nemotron-lightning",
    label: "Nemotron 3.5 Lightning (free)",
    description: "OpenRouter 免費・1M 上下文・高速",
  },
  {
    value: "inkling",
    label: "Inkling (free)",
    description: "OpenRouter 免費・1M 上下文・文字＋圖片＋音訊輸入",
  },
  {
    value: "gemma-4-31b",
    label: "Gemma 4 31B (free)",
    description: "OpenRouter 免費・262k 上下文・文字＋圖片＋影片輸入",
  },
  {
    value: "north-mini-code",
    label: "Cohere North Mini Code (free)",
    description: "OpenRouter 免費・256k 上下文・agentic coding 專用",
  },
  {
    value: "laguna-s",
    label: "Poolside Laguna S 2.1 (free)",
    description: "OpenRouter 免費・262k 上下文・程式取向",
  },
  {
    value: "ling-flash",
    label: "Ling 3.1 Flash (free)",
    description: "OpenRouter 免費・262k 上下文・快速",
  },
  {
    value: "lfm-mini",
    label: "LFM 2.5 2.6B (free)",
    description: "OpenRouter 免費・65k 上下文・最小最快",
  },
  {
    value: "openrouter-auto",
    label: "OpenRouter Auto (free)",
    description: "自動路由到當前可用的免費模型・200k 上下文",
  },
];

/**
 * OpenAI 相容端點上的免費模型：Groq 免費方案與 Cohere 試用金鑰。
 * 這些不是 OpenAI 自家模型，需搭配對應 base_url：
 *   Groq   → https://api.groq.com/openai/v1
 *   Cohere → https://api.cohere.ai/compatibility/v1
 * 注意 Groq 的 llama-3.3-70b-versatile / llama-3.1-8b-instant 已轉為 Enterprise，不再免費。
 */
export const OPENAI_COMPATIBLE_LLM_MODEL_OPTIONS: ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> = [
  {
    value: "gpt-oss-120b",
    label: "GPT-OSS 120B (Groq free)",
    description: "Groq 免費方案・131k 上下文・30 RPM / 1,000 RPD / 8K TPM",
  },
  {
    value: "gpt-oss-20b",
    label: "GPT-OSS 20B (Groq free)",
    description: "Groq 免費方案・131k 上下文・30 RPM / 1,000 RPD / 8K TPM",
  },
  {
    value: "qwen3-27b",
    label: "Qwen3.8 27B (Groq free)",
    description: "Groq 免費方案・131k 上下文・最大輸出 16k",
  },
  {
    value: "command-a",
    label: "Cohere Command A (trial)",
    description: "Cohere 試用金鑰・256k 上下文・每月 1,000 次呼叫上限",
  },
  {
    value: "command-r7b",
    label: "Cohere Command R7B (trial)",
    description: "Cohere 試用金鑰・128k 上下文・小而快・每月 1,000 次上限",
  },
];

export const CUSTOM_LLM_MODEL_OPTIONS: ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> = [
  {
    value: CUSTOM_LLM_MODEL,
    label: "Custom model",
    description: "Model configured on your custom provider",
  },
];

export const LLM_MODEL_OPTIONS: ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> = [
  ...ANTHROPIC_LLM_MODEL_OPTIONS,
  ...OPENROUTER_LLM_MODEL_OPTIONS,
  ...OPENAI_COMPATIBLE_LLM_MODEL_OPTIONS,
  ...CUSTOM_LLM_MODEL_OPTIONS,
];

/** 只能透過 OpenRouter 取得的免費模型。 */
const OPENROUTER_ONLY_MODELS = new Set<LlmModel>([
  "nemotron-ultra",
  "nemotron-lightning",
  "inkling",
  "gemma-4-31b",
  "north-mini-code",
  "laguna-s",
  "ling-flash",
  "lfm-mini",
  "openrouter-auto",
]);

/** camelAI 託管模型已全部退役（自架部署呼叫不到），此集合保留為空。 */
const CAMELAI_HOSTED_ONLY_MODELS = new Set<LlmModel>([]);

/**
 * 「camelCode」這個產品名稱沿用，但底層已從 camelAI 託管的 deepseek-v4-auto
 * 改為 OpenRouter 免費的 Cohere North Mini Code（agentic coding 專用、256k）。
 */
export const CAMEL_CODE_LLM_MODEL = "north-mini-code" satisfies LlmModel;

// 所有模型現在都是免費的，credit-free 的區分已無實質意義，僅保留符號相容性。
const CREDIT_FREE_HOSTED_MODELS = new Set<LlmModel>([
  CAMEL_CODE_LLM_MODEL,
]);

const PINNED_VISIBLE_LLM_MODELS = new Set<LlmModel>([
  CAMEL_CODE_LLM_MODEL,
]);

export function isCreditFreeHostedModel(model: string | null | undefined): boolean {
  return Boolean(model && CREDIT_FREE_HOSTED_MODELS.has(model as LlmModel));
}

function sortVisibleLlmModelOptions<
  T extends { value: LlmModel },
>(options: readonly T[]): T[] {
  return [...options].sort(
    (a, b) =>
      Number(PINNED_VISIBLE_LLM_MODELS.has(b.value)) -
      Number(PINNED_VISIBLE_LLM_MODELS.has(a.value)),
  );
}

/** Bedrock 沒有免費模型，此集合保留為空。 */
const BEDROCK_ONLY_OPENAI_MODELS = new Set<LlmModel>([]);

/** Bedrock 沒有免費模型，故無區域限制表。 */
export const BEDROCK_OPENAI_MODEL_REGIONS: Readonly<Record<string, readonly string[]>> = {};

export function getBedrockOpenAiModelRegions(
  model: LlmModel,
  preferredRegion?: string | null,
): readonly string[] {
  const supportedRegions = BEDROCK_OPENAI_MODEL_REGIONS[model] ?? [];
  const normalizedPreferred = preferredRegion?.trim();
  if (!normalizedPreferred || !supportedRegions.includes(normalizedPreferred)) {
    return supportedRegions;
  }
  return [
    normalizedPreferred,
    ...supportedRegions.filter((region) => region !== normalizedPreferred),
  ];
}

export function isBedrockOpenAiModelAllowedInRegion(
  model: LlmModel,
  awsRegion: string | null | undefined,
): boolean {
  return getBedrockOpenAiModelRegions(model, awsRegion).length > 0;
}

export interface LlmProviderStoredConfig {
  aws_region?: string;
  custom_name?: string;
  custom_base_url?: string;
  custom_auth_type?: "bearer" | "x-api-key";
  custom_api?: "openai-completions" | "openai-responses" | "anthropic-messages";
  custom_model_id?: string;
}

export type CustomLlmProviderApi = NonNullable<
  LlmProviderStoredConfig["custom_api"]
>;

interface LlmProviderModelOptions {
  customApi?: CustomLlmProviderApi | null;
  customModelId?: string | null;
  awsRegion?: string | null;
  allowOpenAiSubscription?: boolean;
  allowCamelCode?: boolean;
}

export function getDefaultLlmModel(
  orgProvider?: string | null,
  options?: LlmProviderModelOptions,
): LlmModel {
  if (orgProvider === "openai") return DEFAULT_OPENAI_MODEL;
  if (orgProvider === "openrouter") return DEFAULT_OPENROUTER_MODEL;
  // Bedrock 沒有免費模型，故不在此回傳特定模型；bedrock provider 會落到
  // 底下的 DEFAULT_ANTHROPIC_MODEL（= custom），由 custom_model_id 決定。
  if (orgProvider === "custom" && hasCustomModelId(options?.customModelId)) {
    return CUSTOM_LLM_MODEL;
  }
  if (orgProvider === "custom" && isOpenAiCompatibleCustomApi(options?.customApi)) {
    return DEFAULT_OPENAI_MODEL;
  }
  if (
    orgProvider === "anthropic" ||
    orgProvider === "bedrock" ||
    orgProvider === "custom" && options?.customApi === "anthropic-messages"
  ) {
    return DEFAULT_ANTHROPIC_MODEL;
  }
  return DEFAULT_LLM_MODEL;
}

export function getLlmModelOptions(
  orgProvider?: string | null,
  options?: LlmProviderModelOptions,
): ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> {
  if (orgProvider === "custom" && hasCustomModelId(options?.customModelId)) {
    return CUSTOM_LLM_MODEL_OPTIONS;
  }
  return LLM_MODEL_OPTIONS.filter(
    (option) => isLlmModelAllowedForOrgProvider(option.value, orgProvider, options),
  );
}

export function isAnthropicLlmModel(model: unknown): model is LlmModel {
  return ANTHROPIC_LLM_MODEL_OPTIONS.some((option) => option.value === model);
}

export function isOpenAiCompatibleLlmModel(model: unknown): model is LlmModel {
  return OPENAI_COMPATIBLE_LLM_MODEL_OPTIONS.some((option) => option.value === model);
}

export function isLlmModelCoveredByOpenAiSubscription(
  model: LlmModel,
): boolean {
  return (
    isOpenAiCompatibleLlmModel(model) &&
    !OPENROUTER_ONLY_MODELS.has(model) &&
    !BEDROCK_ONLY_OPENAI_MODELS.has(model) &&
    !CAMELAI_HOSTED_ONLY_MODELS.has(model)
  );
}

export function getVisibleLlmModelOptions(
  includeModel?: LlmModel | null,
  options?: {
    orgProvider?: string | null;
    customApi?: CustomLlmProviderApi | null;
    customModelId?: string | null;
    awsRegion?: string | null;
    allowOpenAiSubscription?: boolean;
    allowCamelCode?: boolean;
  },
): ReadonlyArray<{
  value: LlmModel;
  label: string;
  description: string;
}> {
  const baseOptions = getLlmModelOptions(options?.orgProvider, {
    customApi: options?.customApi,
    customModelId: options?.customModelId,
    awsRegion: options?.awsRegion,
    allowOpenAiSubscription: options?.allowOpenAiSubscription,
    allowCamelCode: options?.allowCamelCode,
  });
  const visibleOptions = sortVisibleLlmModelOptions(baseOptions);

  if (
    !includeModel ||
    visibleOptions.some((option) => option.value === includeModel)
  ) {
    return visibleOptions;
  }

  // Retained thread models may bypass the provider catalog so an existing
  // hosted thread can remain usable after an admin changes picker settings.
  // Runtime exclusions are different: self-host must never re-add camelCode
  // merely because a legacy thread still has it stored.
  if (
    !isLlmModelAllowedForOrgProvider(includeModel, options?.orgProvider, {
      customApi: options?.customApi,
      customModelId: options?.customModelId,
      awsRegion: options?.awsRegion,
      allowOpenAiSubscription: options?.allowOpenAiSubscription,
      allowCamelCode: options?.allowCamelCode,
    })
  ) {
    return visibleOptions;
  }

  const fallbackOption = [
    ...OPENAI_COMPATIBLE_LLM_MODEL_OPTIONS,
    ...ANTHROPIC_LLM_MODEL_OPTIONS,
  ].find((option) => option.value === includeModel);

  return fallbackOption
    ? sortVisibleLlmModelOptions([fallbackOption, ...visibleOptions])
    : visibleOptions;
}

export function isLlmModelAllowedForNewThread(
  value: unknown,
  orgProvider: string | null | undefined,
  options?: LlmProviderModelOptions,
): value is LlmModel {
  return (
    isLlmModel(value) &&
    isLlmModelAllowedForOrgProvider(value, orgProvider, options)
  );
}

export function isLlmModel(value: unknown): value is LlmModel {
  return (
    isOpenAiCompatibleLlmModel(value) ||
    isAnthropicLlmModel(value) ||
    value === CUSTOM_LLM_MODEL
  );
}

export function isLlmModelAllowedForOrgProvider(
  model: LlmModel,
  orgProvider?: string | null,
  options?: LlmProviderModelOptions,
): boolean {
  if (
    options?.allowOpenAiSubscription &&
    isLlmModelCoveredByOpenAiSubscription(model)
  ) {
    return true;
  }
  if (model === CAMEL_CODE_LLM_MODEL) {
    return options?.allowCamelCode !== false;
  }
  if (CAMELAI_HOSTED_ONLY_MODELS.has(model) && orgProvider) {
    return false;
  }
  if (orgProvider === "openai") {
    return isOpenAiCompatibleLlmModel(model) &&
      !OPENROUTER_ONLY_MODELS.has(model) &&
      !BEDROCK_ONLY_OPENAI_MODELS.has(model);
  }
  if (orgProvider === "anthropic") {
    return isAnthropicLlmModel(model);
  }
  if (orgProvider === "bedrock") {
    return isAnthropicLlmModel(model) ||
      BEDROCK_ONLY_OPENAI_MODELS.has(model) &&
        isBedrockOpenAiModelAllowedInRegion(model, options?.awsRegion);
  }
  if (orgProvider === "custom") {
    if (model === CUSTOM_LLM_MODEL) {
      return hasCustomModelId(options?.customModelId);
    }
    if (options?.customApi === "anthropic-messages") {
      return isAnthropicLlmModel(model);
    }
    if (isOpenAiCompatibleCustomApi(options?.customApi)) {
      return isOpenAiCompatibleLlmModel(model) &&
        !OPENROUTER_ONLY_MODELS.has(model) &&
        !BEDROCK_ONLY_OPENAI_MODELS.has(model);
    }
    return !BEDROCK_ONLY_OPENAI_MODELS.has(model);
  }
  if (OPENROUTER_ONLY_MODELS.has(model)) {
    return orgProvider !== "openai";
  }
  if (BEDROCK_ONLY_OPENAI_MODELS.has(model)) return false;
  if (model === CUSTOM_LLM_MODEL) return false;
  return true;
}

export function isLlmModelCoveredByByokProvider(
  model: LlmModel | null | undefined,
  provider: string | null | undefined,
): boolean {
  if (!provider) return false;
  if (!model) return true;
  if (provider === "openrouter") return true;
  if (provider === "anthropic") {
    return isAnthropicLlmModel(model);
  }
  if (provider === "bedrock") {
    return isAnthropicLlmModel(model) ||
      BEDROCK_ONLY_OPENAI_MODELS.has(model) &&
        isBedrockOpenAiModelAllowedInRegion(model, undefined);
  }
  if (provider === "openai") {
    return isOpenAiCompatibleLlmModel(model) &&
      !OPENROUTER_ONLY_MODELS.has(model) &&
      !BEDROCK_ONLY_OPENAI_MODELS.has(model);
  }
  if (provider === "custom") return true;
  return false;
}

export function normalizeLlmModel(
  value: unknown,
  orgProvider?: string | null,
  options?: LlmProviderModelOptions,
): LlmModel {
  return resolveStoredLlmModel(value, orgProvider, options) ??
    getDefaultLlmModel(orgProvider, options);
}

/** A retired model id's closest replacement; any other value is returned as is. */
export function replaceRetiredLlmModel(
  value: string,
  orgProvider?: string | null,
): string {
  if (
    orgProvider === "bedrock" && STORED_BEDROCK_OPENAI_MODELS.has(value) ||
    value === "gpt-5.6-sol-bedrock" ||
    value === "gpt-5.5-bedrock" ||
    value === "gpt-5.4-bedrock"
  ) {
    return "gpt-5.6-terra-bedrock";
  }
  return STORED_LLM_MODEL_REPLACEMENTS[value] ?? value;
}

export function resolveStoredLlmModel(
  value: unknown,
  orgProvider?: string | null,
  options?: LlmProviderModelOptions,
): LlmModel | null {
  if (typeof value !== "string") return null;

  const replacement = replaceRetiredLlmModel(value, orgProvider);

  return isLlmModel(replacement) &&
      isLlmModelAllowedForOrgProvider(replacement, orgProvider, options)
    ? replacement
    : null;
}

export function isOpenAiCompatibleCustomApi(
  customApi: CustomLlmProviderApi | null | undefined,
): boolean {
  return customApi === "openai-completions" || customApi === "openai-responses";
}

export function hasCustomModelId(customModelId: string | null | undefined): boolean {
  return Boolean(customModelId?.trim());
}

export function parseStoredLlmProviderConfig(
  raw: unknown,
): LlmProviderStoredConfig {
  let config: Record<string, unknown> = {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      config = {};
    }
  } else if (raw && typeof raw === "object") {
    config = raw as Record<string, unknown>;
  }

  const awsRegion =
    typeof config.aws_region === "string" && config.aws_region.trim()
      ? config.aws_region.trim()
      : undefined;
  const customName =
    typeof config.custom_name === "string" && config.custom_name.trim()
      ? config.custom_name.trim().slice(0, 80)
      : undefined;
  const customBaseUrl =
    typeof config.custom_base_url === "string" && config.custom_base_url.trim()
      ? config.custom_base_url.trim().replace(/\/+$/, "")
      : undefined;
  const customAuthType =
    config.custom_auth_type === "bearer" || config.custom_auth_type === "x-api-key"
      ? config.custom_auth_type
      : undefined;
  const customApi =
    config.custom_api === "openai-completions" ||
    config.custom_api === "openai-responses" ||
    config.custom_api === "anthropic-messages"
      ? config.custom_api
      : undefined;
  const customModelId =
    typeof config.custom_model_id === "string" && config.custom_model_id.trim()
      ? config.custom_model_id.trim().slice(0, 200)
      : undefined;

  return {
    ...(awsRegion ? { aws_region: awsRegion } : {}),
    ...(customName ? { custom_name: customName } : {}),
    ...(customBaseUrl ? { custom_base_url: customBaseUrl } : {}),
    ...(customAuthType ? { custom_auth_type: customAuthType } : {}),
    ...(customApi ? { custom_api: customApi } : {}),
    ...(customModelId ? { custom_model_id: customModelId } : {}),
  };
}

export function stringifyStoredLlmProviderConfig(
  config: Partial<LlmProviderStoredConfig>,
): string {
  const normalized = parseStoredLlmProviderConfig(config);
  return JSON.stringify({
    ...(normalized.aws_region ? { aws_region: normalized.aws_region } : {}),
    ...(normalized.custom_name ? { custom_name: normalized.custom_name } : {}),
    ...(normalized.custom_base_url ? { custom_base_url: normalized.custom_base_url } : {}),
    ...(normalized.custom_auth_type ? { custom_auth_type: normalized.custom_auth_type } : {}),
    ...(normalized.custom_api ? { custom_api: normalized.custom_api } : {}),
    ...(normalized.custom_model_id ? { custom_model_id: normalized.custom_model_id } : {}),
  });
}

export interface LlmProviderConfigRecord {
  provider: string;
  credentials_encrypted: string;
  config: string;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export function getStoredCustomLlmProviderApi(
  record: Pick<LlmProviderConfigRecord, "provider" | "config"> | null | undefined,
): CustomLlmProviderApi | null {
  if (record?.provider !== "custom") return null;
  return parseStoredLlmProviderConfig(record.config).custom_api ?? null;
}

export function getStoredCustomLlmProviderModelId(
  record: Pick<LlmProviderConfigRecord, "provider" | "config"> | null | undefined,
): string | null {
  if (record?.provider !== "custom") return null;
  return parseStoredLlmProviderConfig(record.config).custom_model_id ?? null;
}

export function getStoredBedrockAwsRegion(
  record: Pick<LlmProviderConfigRecord, "provider" | "config"> | null | undefined,
): string | null {
  if (record?.provider !== "bedrock") return null;
  return parseStoredLlmProviderConfig(record.config).aws_region ?? null;
}

export function keyHint(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 4)}...`;
  return `${key.slice(0, 8)}...`;
}

export async function buildPublicLlmProviderConfig(
  record: LlmProviderConfigRecord,
  integrationSecretKey: string,
): Promise<LlmProviderConfigPublic> {
  let hint = "********";

  try {
    const creds = await decryptCredentials<Record<string, string>>(
      record.credentials_encrypted,
      integrationSecretKey,
    );
    const primaryKey =
      record.provider === "anthropic" ||
      record.provider === "openai" ||
      record.provider === "openrouter" ||
      record.provider === "custom"
        ? creds.api_key
        : creds.bearer_token;
    if (primaryKey) {
      hint = keyHint(primaryKey);
    }
  } catch {
    // Fall back to a generic redacted hint.
  }

  return {
    provider: record.provider as LlmProvider,
    config: parseStoredLlmProviderConfig(record.config),
    key_hint: hint,
    created_by: record.created_by,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

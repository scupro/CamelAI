import type {
  LlmModel,
  LlmProvider,
} from "../types";
import {
  CUSTOM_LLM_MODEL,
  getVisibleLlmModelOptions,
  type CustomLlmProviderApi,
} from "./llm-provider-config";
import type { EffectiveModelPickerConfig } from "./model-picker-config";

// Adding a new model - checklist
//
// 1. Add the canonical ID to the LlmModel union in src/types.ts.
// 2. Add model visibility/routing branches in src/lib/llm-provider-config.ts:
//    isLlmModel, isLlmModelAllowedForOrgProvider, and the model option lists.
// 3. Add per-token pricing in src/lib/usage-pricing.ts.
// 4. Add a MODEL_CATALOG entry below with a version-qualified label, logo type,
//    provider order, cost bucket, intelligence, and speed.
// 5. Add or update catalog tests so model picker platform defaults include it.
// 6. Add or update the catalog tests so the TS catalog, logos, and pricing do
//    not drift apart.

export type ProviderLogoType =
  | "camelai"
  | "claude"
  | "openai"
  | "kimi"
  | "grok"
  | "glm"
  | "gemini"
  | "deepseek"
  // 免費模型清單新增：OpenRouter 是所有 :free 模型的實際提供管道，
  // 且 integration-logo-registry 已註冊 "openrouter" 圖示。
  | "openrouter";
export type CostBucket = "Free" | "$" | "$$" | "$$$" | "$$$$" | "$$$$$";
export const COST_BUCKET_MAX = 5;
// Half-step rating, 0.5 through 5.0. Used for both intelligence and speed.
// Renders as 5 circles in the model picker hover tooltip.
export type RatingScore =
  | 0.5
  | 1
  | 1.5
  | 2
  | 2.5
  | 3
  | 3.5
  | 4
  | 4.5
  | 5;

export interface ModelCatalogEntry {
  id: LlmModel;
  label: string;
  providerLogo: ProviderLogoType;
  providerOrder: number;
  modelOrder: number;
  cost: CostBucket;
  intelligence: RatingScore;
  speed: RatingScore;
}

/** slug → usage-pricing.ts 的計價鍵（即供應商真實模型 ID）。全部免費。 */
export const LLM_MODEL_TO_PRICING_KEY: Readonly<Record<LlmModel, string>> = {
  "nemotron-ultra": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nemotron-lightning": "nvidia/nemotron-3.5-lightning:free",
  "inkling": "thinkingmachines/inkling:free",
  "gemma-4-31b": "google/gemma-4-31b-it:free",
  "north-mini-code": "cohere/north-mini-code:free",
  "laguna-s": "poolside/laguna-s-2.1:free",
  "ling-flash": "inclusionai/ling-3.1-flash",
  "lfm-mini": "liquid/lfm-2.5-2.6b:free",
  "openrouter-auto": "openrouter/free",
  "gpt-oss-120b": "groq/openai/gpt-oss-120b",
  "gpt-oss-20b": "groq/openai/gpt-oss-20b",
  "qwen3-27b": "groq/qwen/qwen3.8-27b",
  "command-a": "cohere/command-a-03-2025",
  "command-r7b": "cohere/command-r7b-12-2024",
  "custom": "custom",
};

// 所有模型皆為供應商免費方案，故 cost 一律為 "Free"。
// intelligence / speed 為相對評分（0.5–5.0），依參數量、上下文與供應商
// 公告的吞吐（如 Groq gpt-oss-120b ~500 t/s）手工估計，僅供 picker 顯示。
export const MODEL_CATALOG: Readonly<Record<LlmModel, ModelCatalogEntry>> = {
  "nemotron-ultra": {
    id: "nemotron-ultra",
    label: "Nemotron 3 Ultra 550B (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 0,
    cost: "Free",
    intelligence: 4.5,
    speed: 2,
  },
  "nemotron-lightning": {
    id: "nemotron-lightning",
    label: "Nemotron 3.5 Lightning (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 1,
    cost: "Free",
    intelligence: 3.5,
    speed: 4.5,
  },
  "inkling": {
    id: "inkling",
    label: "Inkling (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 2,
    cost: "Free",
    intelligence: 4,
    speed: 3,
  },
  "gemma-4-31b": {
    id: "gemma-4-31b",
    label: "Gemma 4 31B (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 3,
    cost: "Free",
    intelligence: 3.5,
    speed: 3.5,
  },
  "north-mini-code": {
    id: "north-mini-code",
    label: "North Mini Code (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 4,
    cost: "Free",
    intelligence: 3.5,
    speed: 4,
  },
  "laguna-s": {
    id: "laguna-s",
    label: "Laguna S 2.1 (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 5,
    cost: "Free",
    intelligence: 3.5,
    speed: 3.5,
  },
  "ling-flash": {
    id: "ling-flash",
    label: "Ling 3.1 Flash (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 6,
    cost: "Free",
    intelligence: 3,
    speed: 4.5,
  },
  "lfm-mini": {
    id: "lfm-mini",
    label: "LFM 2.5 2.6B (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 7,
    cost: "Free",
    intelligence: 2,
    speed: 5,
  },
  "openrouter-auto": {
    id: "openrouter-auto",
    label: "OpenRouter Auto (free)",
    providerLogo: "openrouter",
    providerOrder: 0,
    modelOrder: 8,
    cost: "Free",
    intelligence: 3,
    speed: 3.5,
  },
  "gpt-oss-120b": {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B (Groq free)",
    providerLogo: "openai",
    providerOrder: 1,
    modelOrder: 0,
    cost: "Free",
    intelligence: 4,
    speed: 4.5,
  },
  "gpt-oss-20b": {
    id: "gpt-oss-20b",
    label: "GPT-OSS 20B (Groq free)",
    providerLogo: "openai",
    providerOrder: 1,
    modelOrder: 1,
    cost: "Free",
    intelligence: 3,
    speed: 5,
  },
  "qwen3-27b": {
    id: "qwen3-27b",
    label: "Qwen3.8 27B (Groq free)",
    providerLogo: "openai",
    providerOrder: 1,
    modelOrder: 2,
    cost: "Free",
    intelligence: 3.5,
    speed: 4.5,
  },
  "command-a": {
    id: "command-a",
    label: "Command A (Cohere trial)",
    providerLogo: "openai",
    providerOrder: 1,
    modelOrder: 3,
    cost: "Free",
    intelligence: 4,
    speed: 3,
  },
  "command-r7b": {
    id: "command-r7b",
    label: "Command R7B (Cohere trial)",
    providerLogo: "openai",
    providerOrder: 1,
    modelOrder: 4,
    cost: "Free",
    intelligence: 3,
    speed: 4.5,
  },
  "custom": {
    id: "custom",
    label: "Custom model",
    providerLogo: "camelai",
    providerOrder: 2,
    modelOrder: 0,
    cost: "Free",
    intelligence: 3,
    speed: 3,
  },
};

export const ALL_LLM_MODELS = Object.keys(MODEL_CATALOG) as LlmModel[];

export interface ResolvedModelCatalogEntry extends ModelCatalogEntry {
  addedAt: number;
}

const PINNED_MODEL_IDS = new Set<LlmModel>(["north-mini-code"]);

export function compareModelCatalogEntries(
  a: ModelCatalogEntry,
  b: ModelCatalogEntry,
): number {
  return (
    Number(PINNED_MODEL_IDS.has(b.id)) - Number(PINNED_MODEL_IDS.has(a.id)) ||
    a.providerOrder - b.providerOrder ||
    a.modelOrder - b.modelOrder ||
    a.label.localeCompare(b.label)
  );
}

export function resolveModelPickerCatalog(args: {
  effectiveConfig: EffectiveModelPickerConfig;
  orgProvider?: LlmProvider | string | null;
  customApi?: CustomLlmProviderApi | null;
  customModelId?: string | null;
  awsRegion?: string | null;
  allowOpenAiSubscription?: boolean;
  allowCamelCode?: boolean;
}): ResolvedModelCatalogEntry[] {
  const visibleModelIds = new Set(
    getVisibleLlmModelOptions(null, {
      orgProvider: args.orgProvider,
      customApi: args.customApi,
      customModelId: args.customModelId,
      awsRegion: args.awsRegion,
      allowOpenAiSubscription: args.allowOpenAiSubscription,
      allowCamelCode: args.allowCamelCode,
    }).map((option) => option.value),
  );

  const sourceModels =
    args.effectiveConfig.use_platform_defaults === false
      ? args.effectiveConfig.models
      : [...visibleModelIds].map((id) => ({ id, added_at: Date.now() }));

  const entries = sourceModels
    .filter((model) => visibleModelIds.has(model.id))
    .map((model) => ({
      ...MODEL_CATALOG[model.id],
      addedAt: model.added_at,
    }))
    .sort(compareModelCatalogEntries);

  if (
    entries.length === 0 &&
    args.effectiveConfig.use_platform_defaults !== false &&
    visibleModelIds.has(CUSTOM_LLM_MODEL)
  ) {
    return [{ ...MODEL_CATALOG[CUSTOM_LLM_MODEL], addedAt: Date.now() }];
  }

  return entries;
}

export function modelCatalogEntriesForIds(
  ids: readonly LlmModel[],
): ModelCatalogEntry[] {
  return ids.map((id) => MODEL_CATALOG[id]).filter(Boolean);
}

export function sortAdditionalModelCatalogEntries(
  entries: readonly ModelCatalogEntry[],
): ModelCatalogEntry[] {
  return [...entries].sort(compareModelCatalogEntries);
}

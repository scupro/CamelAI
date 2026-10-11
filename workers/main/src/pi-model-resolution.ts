// Pure Pi model/provider mapping helpers (OpenRouter / Bedrock / custom
// provider model-id and header derivation) extracted from chat-thread-do.ts.
// Stateless: grouped as a class so the verbatim methods keep calling each other
// via `this`. The stateful resolution orchestrators (resolvePiModel,
// resolvePiRequestConfig, getCachedLlmProviderConfig, resolveCurrentByokCredentials)
// remain on ChatThreadDO and call into a PiModelMapping instance.
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  getBedrockOpenAiModelRegions,
  normalizeLlmModel,
} from "../../../src/lib/llm-provider-config";
import type { PiHeaderValue, PiResolvedModelReference } from "./chat-thread-do";

// Retired product and provider ids, run as their closest current model.
const RETIRED_PI_MODEL_IDS: Readonly<Record<string, string>> = {
  haiku: "sonnet",
  opus: "opus-5.5",
  "opus-4.7": "opus-5.5",
  "opus-4.8": "opus-5.5",
  "opus-5": "opus-5.5",
  "fable-5": "fable-5.1",
  "claude-fable-5": "fable-5.1",
  "gpt-6-sol": "gpt-6.1-sol",
  "gpt-5.6-sol": "gpt-6.1-sol",
  "gpt-5.6-terra": "gpt-6.1-sol",
  "gpt-5.6-luna": "gpt-6-luna",
  "gpt-5.6-sol-bedrock": "gpt-5.6-terra-bedrock",
  "gpt-5.5": "gpt-6.1-sol",
  "gpt-5.4": "gpt-6.1-sol",
  "gpt-5.4-mini": "gpt-6-luna",
  "kimi-k2.7-code": "kimi-k3",
  "kimi-k2.6": "kimi-k3",
  "kimi-latest": "kimi-k3",
  "~moonshotai/kimi-latest": "kimi-k3",
  "moonshotai/kimi-latest": "kimi-k3",
  "moonshotai/kimi-k2.6": "kimi-k3",
  "moonshotai/kimi-k2.7-code": "kimi-k3",
  "grok-4.5": "grok-4.7",
  "grok-4.3": "grok-4.7",
  "grok-latest": "grok-4.7",
  "x-ai/grok-4.5": "grok-4.7",
  "x-ai/grok-4.3": "grok-4.7",
  "x-ai/grok-latest": "grok-4.7",
  "glm-5.2": "glm-5.3",
  "glm-latest": "glm-5.3",
  "z-ai/glm-5.2": "glm-5.3",
  "z-ai/glm-latest": "glm-5.3",
  "gemini-3.5-flash": "gemini-3.8-flash",
  "gemini-3-flash-preview": "gemini-3.8-flash",
  "gemini-3.1-pro-preview": "gemini-3.8-flash",
  "deepseek-v4-pro": "ling-flash",
  "deepseek-v4-flash": "ling-flash",
  // 2026-10 全面改用免費模型時退役的 slug（與 llm-provider-config.ts 的
  // STORED_LLM_MODEL_REPLACEMENTS 保持一致）
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
  // Claude 真實 ID（Anthropic 無免費方案）
  "claude-sonnet-5-5": "nemotron-ultra",
  "claude-opus-5-5": "nemotron-ultra",
  "claude-haiku-5-5": "lfm-mini",
  "claude-fable-5-1": "nemotron-ultra",
};

export class PiModelMapping {
  resolvePiModelReference(modelId: string): PiResolvedModelReference {
    const normalizedModelId = this.normalizePiModelId(modelId);
    const claudeReference = (resolvedModelId: string): PiResolvedModelReference => ({
      provider: "anthropic",
      modelId: resolvedModelId,
      hostedGatewayProvider: "openrouter",
      hostedModelId: this.openRouterNitroModel(this.openRouterClaudeModel(resolvedModelId)),
    });
    const openRouterReference = (resolvedModelId: string): PiResolvedModelReference => ({
      provider: "openrouter",
      modelId: resolvedModelId,
      hostedGatewayProvider: "openrouter",
      hostedModelId: this.openRouterNitroModel(resolvedModelId),
    });
    const openRouterResponsesReference = (resolvedModelId: string): PiResolvedModelReference => ({
      ...openRouterReference(resolvedModelId),
      api: "openai-responses",
    });
    const openAiReference = (resolvedModelId: string): PiResolvedModelReference => ({
      provider: "openai",
      modelId: resolvedModelId,
      hostedGatewayProvider: "openrouter",
      hostedModelId: this.openRouterNitroModel(`openai/${resolvedModelId}`),
    });
    // Groq / Cohere 走 OpenAI 相容端點，其真實模型 ID 本身就可能含 "/"
    // （如 Groq 的 openai/gpt-oss-120b），因此不能用 openAiReference——
    // 它會再加一層 "openai/" 前綴。自架部署走 BYOK 路徑，hostedModelId 用不到。
    const openAiCompatibleReference = (
      resolvedModelId: string,
    ): PiResolvedModelReference => ({
      provider: "openai",
      modelId: resolvedModelId,
      hostedGatewayProvider: "openrouter",
      hostedModelId: resolvedModelId,
    });
    switch (normalizedModelId) {
      // --- OpenRouter 免費模型（pricing 全 0，:free 端點）---
      case "nemotron-ultra":
        return openRouterReference("nvidia/nemotron-3-ultra-550b-a55b:free");
      case "nemotron-lightning":
        return openRouterReference("nvidia/nemotron-3.5-lightning:free");
      case "inkling":
        return openRouterReference("thinkingmachines/inkling:free");
      case "gemma-4-31b":
        return openRouterReference("google/gemma-4-31b-it:free");
      case "north-mini-code":
        return openRouterReference("cohere/north-mini-code:free");
      case "laguna-s":
        return openRouterReference("poolside/laguna-s-2.1:free");
      case "ling-flash":
        // 此模型 pricing 為 0 但無 :free 後綴
        return openRouterReference("inclusionai/ling-3.1-flash");
      case "lfm-mini":
        return openRouterReference("liquid/lfm-2.5-2.6b:free");
      case "openrouter-auto":
        return openRouterReference("openrouter/free");
      // --- Groq 免費方案：base_url = https://api.groq.com/openai/v1 ---
      case "gpt-oss-120b":
        return openAiCompatibleReference("openai/gpt-oss-120b");
      case "gpt-oss-20b":
        return openAiCompatibleReference("openai/gpt-oss-20b");
      case "qwen3-27b":
        return openAiCompatibleReference("qwen/qwen3.8-27b");
      // --- Cohere 試用金鑰：base_url = https://api.cohere.ai/compatibility/v1 ---
      case "command-a":
        return openAiCompatibleReference("command-a-03-2025");
      case "command-r7b":
        return openAiCompatibleReference("command-r7b-12-2024");
      case "custom":
        return openAiReference(DEFAULT_OPENAI_MODEL);
      default:
        // 含 "/" 的視為使用者自填的完整供應商模型 ID，直接交給 OpenRouter。
        if (normalizedModelId.includes("/")) {
          return openRouterReference(normalizedModelId);
        }
        return openAiReference(DEFAULT_OPENAI_MODEL);
    }
  }

  normalizePiModelId(modelId: string): string {
    const normalized = modelId.trim();
    return RETIRED_PI_MODEL_IDS[normalized.toLowerCase()] ?? normalized;
  }

  openRouterAttributionHeaders(): Record<string, string> {
    return {
      "HTTP-Referer": "https://camelai.dev",
      "X-OpenRouter-Title": "camelAI",
      "X-OpenRouter-Categories": "cloud-agent,programming-app",
    };
  }

  customProviderAuthHeaders(
    api: "openai-completions" | "openai-responses" | "anthropic-messages",
    authType: "bearer" | "x-api-key",
    apiKey: string,
  ): Record<string, PiHeaderValue> | undefined {
    if (api === "anthropic-messages") {
      return authType === "bearer"
        ? { "x-api-key": null, Authorization: `Bearer ${apiKey}` }
        : undefined;
    }

    return authType === "x-api-key"
      ? { Authorization: null, "x-api-key": apiKey }
      : undefined;
  }

  resolveCustomProviderModelReference(
    api: "openai-completions" | "openai-responses" | "anthropic-messages",
    requestedModelId: string,
    customModelId: string | undefined,
  ): { provider: string; lookupModelId: string; requestModelId: string } {
    const model = normalizeLlmModel(this.normalizePiModelId(requestedModelId), "custom", {
      customApi: api,
      customModelId,
    });
    if (model === "custom" && customModelId?.trim()) {
      const lookupModel =
        api === "anthropic-messages" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
      const lookupReference = this.resolvePiModelReference(lookupModel);
      return {
        provider: lookupReference.provider,
        lookupModelId: lookupReference.modelId,
        requestModelId: customModelId.trim(),
      };
    }
    const reference = this.resolvePiModelReference(model);
    return {
      provider: reference.provider,
      lookupModelId: reference.modelId,
      requestModelId: reference.modelId,
    };
  }

  openRouterClaudeModel(model: string): string {
    switch (model.trim().toLowerCase()) {
      case "sonnet":
      case "claude-sonnet-5-5":
      case "claude-sonnet-5":
        return "anthropic/claude-sonnet-5.5";
      case "haiku-5.5":
      case "claude-haiku-5-5":
        return "anthropic/claude-haiku-5.5";
      case "fable-5.1":
      case "fable-5":
      case "claude-fable-5-1":
      case "claude-fable-5":
        return "anthropic/claude-fable-5.1";
      case "opus":
      case "opus-4.7":
      case "opus-4.8":
      case "opus-5":
      case "opus-5.5":
      case "claude-opus-5-5":
      case "claude-opus-5":
      case "claude-opus-4-8":
      case "claude-opus-4.8":
      case "claude-opus-4-7":
      case "claude-opus-4.7":
      case "claude-opus-4-6":
      case "claude-opus-4.6":
        return "anthropic/claude-opus-5.5";
      case "claude-sonnet-4-6":
        return "anthropic/claude-sonnet-4.6";
      case "claude-sonnet-4-5-20250929":
        return "anthropic/claude-sonnet-4.5";
      case "claude-haiku-4-5-20251001":
        return "anthropic/claude-haiku-4.5";
      case "claude-opus-4-5-20251101":
        return "anthropic/claude-opus-4.5";
      case "claude-sonnet-4-20250514":
        return "anthropic/claude-sonnet-4";
      case "claude-opus-4-20250514":
        return "anthropic/claude-opus-4";
      case "claude-3-7-sonnet-20250219":
        return "anthropic/claude-3.7-sonnet";
      case "claude-3-5-sonnet-20241022":
      case "claude-3-5-sonnet-20240620":
        return "anthropic/claude-3.5-sonnet";
      case "claude-3-5-haiku-20241022":
        return "anthropic/claude-3.5-haiku";
      default:
        return model;
    }
  }

  openRouterNitroModel(model: string): string {
    const trimmed = model.trim();
    if (!trimmed) return model;
    const lower = trimmed.toLowerCase();
    if (
      lower === "openai/gpt-5.6-luna" ||
      lower === "openai/gpt-6-luna" ||
      lower.startsWith("dynamic/") ||
      lower.startsWith("google/gemini-") ||
      lower.startsWith("deepseek/deepseek-v4") ||
      lower.startsWith("anthropic/claude-opus-") ||
      lower.endsWith(":nitro")
    ) {
      return trimmed;
    }
    const lastSegment = trimmed.slice(trimmed.lastIndexOf("/") + 1);
    if (lastSegment.includes(":")) {
      return trimmed;
    }
    return `${trimmed}:nitro`;
  }

  bedrockClaudeModel(modelId: string): string {
    switch (modelId) {
      case "claude-haiku-4-5-20251001":
        return "anthropic.claude-haiku-4-5";
      case "claude-haiku-5-5":
        return "anthropic.claude-haiku-5-5";
      case "claude-opus-5-5":
      case "claude-opus-5":
      case "claude-opus-4-6":
      case "claude-opus-4-7":
      case "claude-opus-4-8":
        return "anthropic.claude-opus-5-5";
      case "claude-fable-5-1":
      case "claude-fable-5":
        return "anthropic.claude-fable-5-1";
      case "claude-sonnet-5-5":
      case "claude-sonnet-5":
      case "claude-sonnet-4-6":
      default:
        return "anthropic.claude-sonnet-5-5";
    }
  }

  bedrockAnthropicMessagesBaseUrl(region: string | undefined): string | undefined {
    const normalized = region?.trim() || "us-east-1";
    if (!/^[a-z0-9-]+$/.test(normalized)) return undefined;
    return `https://bedrock-mantle.${normalized}.api.aws/anthropic`;
  }

  bedrockOpenAiModelConfig(
    modelId: string,
    region: string | undefined,
  ): { modelId: string; baseUrl: string } | null {
    const normalizedModel = modelId.trim().toLowerCase();
    const normalizedRegion = region?.trim() || "us-east-1";
    if (!/^[a-z0-9-]+$/.test(normalizedRegion)) {
      throw new Error(`Invalid Bedrock AWS region: ${normalizedRegion}`);
    }
    const catalogModel = `${normalizedModel}-bedrock` as Parameters<
      typeof getBedrockOpenAiModelRegions
    >[0];
    const selectedRegion = getBedrockOpenAiModelRegions(
      catalogModel,
      normalizedRegion,
    )[0];
    if (!selectedRegion) return null;

    return {
      modelId: `openai.${normalizedModel}`,
      baseUrl: `https://bedrock-mantle.${selectedRegion}.api.aws/openai/v1`,
    };
  }

  bedrockRegionalBaseUrls(modelId: string, baseUrl: string): readonly string[] {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      return [baseUrl];
    }
    const match = /^bedrock-mantle\.([a-z0-9-]+)\.api\.aws$/.exec(parsed.hostname);
    if (!match) return [baseUrl];

    const currentRegion = match[1];
    const normalizedModel = modelId.trim().toLowerCase().replace(/^openai\./, "");
    const catalogModel = `${normalizedModel}-bedrock` as Parameters<
      typeof getBedrockOpenAiModelRegions
    >[0];
    const openAiRegions = getBedrockOpenAiModelRegions(catalogModel, currentRegion);
    const regions = openAiRegions.length > 0
      ? openAiRegions
      : [
          currentRegion,
          ...["us-east-1", "us-east-2", "us-west-2"].filter(
            (region) => region !== currentRegion,
          ),
        ];

    return regions.map((region) => {
      const candidate = new URL(parsed);
      candidate.hostname = `bedrock-mantle.${region}.api.aws`;
      return candidate.toString().replace(/\/$/, "");
    });
  }

}

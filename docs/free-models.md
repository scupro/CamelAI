# 實際可用的免費模型清單（OpenRouter / Groq / Cohere）

> 查證日期：**2026-10-11**。來源均為供應商官方 API 或官方文件，非二手整理。
> 免費模型變動頻繁，重新查證方式見每節末的指令。

本專案的模型選擇器（`src/lib/llm-provider-config.ts`）目前仍以 camelAI 自家託管模型名為主
（`gpt-6-luna`、`opus-5.5`、`deepseek-v4-auto`、`kimi-k3`、`grok-4.7`、`glm-5.3` 等），
這些**不是**下列供應商實際提供的免費模型。本文件記錄真正可用的替代選項。

---

## 1. OpenRouter（免費模型最完整，且本專案已原生支援 `openrouter` provider）

查詢方式：`GET https://openrouter.ai/api/v1/models`，篩選 `pricing` 全部為 `0` 的項目。
本次共 458 個模型，其中 **19 個免費**；排除非文字輸出（音樂生成 `lyria-3-*`）與純內容安全
模型（`nemotron-3.5-content-safety`）後，可用於對話／寫程式的有 **16 個**：

| 模型 ID | 輸入模態 | 上下文 | 備註 |
|---------|---------|--------|------|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | text | 1,000,000 | 免費清單中最大 |
| `nvidia/nemotron-3.5-lightning:free` | text | 1,000,000 | 快速版 |
| `thinkingmachines/inkling:free` | text+image+audio | 1,048,576 | 多模態輸入 |
| `thinkingmachines/inkling-small:free` | text+image+audio | 1,048,576 | 多模態、較小 |
| `dots-studio/dots-3-note-preview:free` | text+image | 512,000 | preview 版 |
| `google/gemma-4-31b-it:free` | text+image+video | 262,144 | |
| `google/gemma-4-26b-a4b-it:free` | text+image+video | 262,144 | MoE |
| `nvidia/nemotron-3-super-120b-a12b:free` | text | 262,144 | |
| `apodex/apodex-1.1-mini:free` | text | 262,144 | |
| `poolside/laguna-s-2.1:free` | text | 262,144 | 程式取向 |
| `poolside/laguna-xs-2.1:free` | text | 262,144 | 程式取向、較小 |
| `inclusionai/ling-3.1-flash` | text | 262,144 | **無 `:free` 後綴**但 pricing 為 0 |
| `cohere/north-mini-code:free` | text | 256,000 | **Cohere 的 agentic coding 模型，經 OpenRouter 免費取得** |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | text+image+audio+video | 256,000 | 推理型、全模態輸入 |
| `openrouter/free` | text+image | 200,000 | 自動路由到當前可用免費模型 |
| `liquid/lfm-2.5-2.6b:free` | text | 65,536 | 最小、最快 |

重新查證：

```bash
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
free=[m for m in d if all(float(v or 0)==0 for v in m.get('pricing',{}).values())]
for m in sorted(free,key=lambda x:x['id']):
    a=m.get('architecture',{})
    print(f\"{m['id']:<52} in={a.get('modality')} ctx={m.get('context_length')}\")
"
```

> ⚠️ OpenRouter 免費模型有**每分鐘／每日請求數限制**（依帳號等級），且 `:free` 端點
> 可能將資料用於訓練。敏感內容請改用付費端點。

---

## 2. Groq（免費方案免信用卡，但模型選擇少）

來源：`console.groq.com/docs/models` 與 `/docs/rate-limits`（Free Plan Limits 分頁）。

**重要：常被當成免費模型的 `llama-3.3-70b-versatile` 與 `llama-3.1-8b-instant` 已改為
Enterprise 方案（文件標價「ContactSales」），不再免費。** `minimaxai/minimax-m2.7` 同樣是 Enterprise。

目前免費方案可用的**文字生成**模型：

| 模型 ID | 上下文 | 最大輸出 | RPM | RPD | TPM | TPD |
|---------|--------|---------|-----|-----|-----|-----|
| `openai/gpt-oss-120b` | 131,072 | 65,536 | 30 | 1,000 | 8K | 200K |
| `openai/gpt-oss-20b` | 131,072 | 65,536 | 30 | 1,000 | 8K | 200K |
| `qwen/qwen3.8-27b` | 131,072 | 16,384 | 30 | 1,000 | 8K | 200K |

免費方案的其他模型（非對話用途）：

| 模型 ID | 用途 | 限制 |
|---------|------|------|
| `openai/gpt-oss-safeguard-20b` | 內容安全 | 3 RPM / 1K RPD |
| `meta-llama/llama-prompt-guard-2-86m` | prompt 注入偵測 | 30 RPM / 14.4K RPD |
| `meta-llama/llama-prompt-guard-2-22m` | prompt 注入偵測 | 30 RPM / 14.4K RPD |
| `whisper-large-v3` | 語音轉文字 | 20 RPM / 7.2K ASH |
| `whisper-large-v3-turbo` | 語音轉文字 | 20 RPM / 7.2K ASH |

> 注意：`docs/models` 頁面列出的 `PRICE PER 1M TOKENS`（如 gpt-oss-120b $0.15/$0.60）是
> **Developer 付費方案**的價格；免費方案走的是上表的 RPM/RPD/TPM 限制。
> 免費方案的 1K RPD（每日 1000 次請求）對個人使用足夠，但比 OpenRouter 嚴格。

Groq 是 **OpenAI 相容** API，接法：

```
base_url = https://api.groq.com/openai/v1
```

---

## 3. Cohere（免費試用金鑰，但每月僅 1,000 次呼叫）

來源：`docs.cohere.com/docs/rate-limits`。

Cohere 提供兩種金鑰：**evaluation key（免費但用量受限）**與 production key（付費）。
免費試用金鑰的硬限制是 **每月 1,000 次 API 呼叫**、每模型 **20 req/min**。

Chat API 免費可用的模型：

| 顯示名稱 | 模型 ID | 模態 | 上下文 | 最大輸出 |
|---------|---------|------|--------|---------|
| Command A+ | `command-a-plus-05-2026` | text+image | 128k | 64k |
| Command A Reasoning | `command-a-reasoning-08-2025` | text | 256k | 32k |
| Command A | `command-a-03-2025` | text | 256k | 8k |
| Command A Vision | `command-a-vision-07-2025` | text+image | 128k | 8k |
| Command A Translate | `command-a-translate-08-2025` | text | 8k | 8k |
| Command R+ | `command-r-plus-08-2024` | text | 128k | 4k |
| Command R | `command-r-08-2024` | text | 128k | 4k |
| Command R7B | `command-r7b-12-2024` | text | 128k | 4k |
| North Mini Code | `north-mini-code-1-0` | text | 256k | 64k |

> ⚠️ **每月 1,000 次呼叫**對互動式使用非常吃緊（一天約 33 次）。
> 文件另註明：較新的模型變體（如 Command A Reasoning）即使用 production key 也仍套用試用限制。
>
> 已於 2025-09-15 停用、**不要再用**：`command-r-03-2024`、`command-r-plus-04-2024`、
> `command-r-plus`、`command-r`、`command-light`、`command`。

Cohere 有 OpenAI 相容端點，接法：

```
base_url = https://api.cohere.ai/compatibility/v1
```

**實務建議**：`cohere/north-mini-code:free` 可直接透過 OpenRouter 免費取得（256k 上下文、
無每月 1000 次限制），比直連 Cohere 划算得多。

---

## 4. 在本專案中接上這些模型

`src/types.ts` 的 `LlmProvider` 目前只有 `anthropic | bedrock | custom | openai | openrouter`，
**沒有 groq / cohere**。因此：

| 供應商 | 接法 | 對應設定 |
|--------|------|---------|
| OpenRouter | 原生支援 | `SELFHOST_AI_PROVIDER=openrouter`，模型 ID 直接填 |
| Groq | OpenAI 相容 | `SELFHOST_AI_PROVIDER=custom`、`SELFHOST_AI_API=openai-completions`、`SELFHOST_AI_BASE_URL=https://api.groq.com/openai/v1` |
| Cohere | OpenAI 相容端點 | 同上，`SELFHOST_AI_BASE_URL=https://api.cohere.ai/compatibility/v1` |

設定後模型由 `custom_model_id` 決定（`src/lib/selfhost-ai-provider.ts:84`），
此時選擇器只會顯示「Custom model」一項——這是既有設計，非 bug。

```bash
# 例：用 Groq 免費的 gpt-oss-120b
printf 'custom'                              | npx wrangler secret put SELFHOST_AI_PROVIDER
printf 'openai-completions'                  | npx wrangler secret put SELFHOST_AI_API
printf 'https://api.groq.com/openai/v1'      | npx wrangler secret put SELFHOST_AI_BASE_URL
printf 'gsk_...'                             | npx wrangler secret put SELFHOST_AI_API_KEY
printf 'openai/gpt-oss-120b'                 | npx wrangler secret put SELFHOST_AI_MODEL
```

---

## 5. 待辦：把選擇器換成真實免費模型

模型選擇器的內容與**解析／計費邏輯綁在一起**，不能只改 picker。受影響檔案（依引用數）：

| 檔案 | 引用數 | 角色 |
|------|-------|------|
| `workers/main/src/pi-model-resolution.ts` | 39 | 模型 → 實際 API 呼叫的解析 |
| `src/lib/llm-provider-config.ts` | 37 | 選項清單、預設值、provider 過濾 |
| `src/lib/model-catalog.ts` | 22 | 模型目錄 |
| `src/lib/usage-pricing.ts` | 13 | 用量計價 |
| `workers/main/src/ai-virtual-binding.ts` | 9 | Workers AI 綁定 |
| `workers/main/src/routes/admin/schemas.ts` | 8 | admin API schema |
| `src/types.ts` | 8 | `LlmModel` 型別聯合 |
| `org-do.ts` / `d1-mirror-reconcile.ts` / `pi-model-config.ts` | 各 1 | 零散引用 |

替換時必須同步處理：

- `LlmModel` 型別聯合（`src/types.ts:557-572`）
- `STORED_LLM_MODEL_REPLACEMENTS`（`llm-provider-config.ts:20`）——**已存在 DB 的舊模型 ID 要靠這張表轉譯**，否則既有對話會拿到無效模型
- `CAMEL_CODE_LLM_MODEL = "deepseek-v4-auto"`（29 處引用，含 credit-free／pinned 特殊語意）
- `OPENROUTER_ONLY_MODELS`、`CAMELAI_HOSTED_ONLY_MODELS`、`BEDROCK_ONLY_OPENAI_MODELS`、`CREDIT_FREE_HOSTED_MODELS`、`PINNED_VISIBLE_LLM_MODELS`
- `DEFAULT_LLM_MODEL` / `DEFAULT_OPENAI_MODEL` / `DEFAULT_OPENROUTER_MODEL` / `DEFAULT_ANTHROPIC_MODEL`

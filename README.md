# CamelAI (Free Tier Edition)

**個人用途的 AI Coding Assistant**，基於 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 修改而成，針對 Cloudflare Workers Free 層精簡：移除 R2、Sandbox 容器、Billing 及複雜功能，保留核心 AI 代理與 Durable Objects 架構。

**部署方式**：透過 **Cloudflare 面板連接 GitHub** 部署（Workers Builds）。KV／D1 在 `wrangler.jsonc` 只宣告 **binding 名稱**，部署時自動建立資源，綁定與 id 都呈現在面板 **Settings → Bindings**（repo 內不留任何 id）；配置**字串**與 secret 則放在 **Variables and secrets**，兩者位置不同、機制不同。

---

## 📦 上游來源

本項目修改自 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）：
- 原項目：`an AI coding assistant platform built on Cloudflare Workers and Durable Objects`
- 修改原因：原項目依賴 R2（啟用需登記信用卡）、Durable Objects 容器、Queues 等需付費或需登記付款方式的資源，無法在「不綁信用卡」的前提下運行
- 本項目保留核心：Durable Objects（ChatThreadDO、UserDO、OrgDO、SignupDO、WorkspaceDO、WorkspaceFilesystemDO 等）、D1 資料庫、KV 命名空間、Workers AI、完整 React Router Web UI

### 已刪除的高階／付費功能

| 功能 | 相關資源 | 處理方式 |
|------|----------|----------|
| 計費／訂閱／額度 | Stripe、paywall、credit packs、用量限額 | 頁面與 API 路由刪除；殘存的方案／限額介面一律視為「未受限」 |
| Notebook 與程式碼執行 | Sandbox 容器（`ANALYSIS_SANDBOX`） | 執行路徑刪除；`.ipynb` 唯讀預覽仍保留（純靜態渲染） |
| 專案建置與部署 | 建置容器（`PROJECT_BUILD_SANDBOX`）、Dispatch Nest、Worker Loader | 部署／建置流程刪除 |
| SQL 連線查詢 | 查詢容器（`DB_QUERY_SANDBOX`）、DB egress relay | 查詢與倉儲匯出刪除；其他 OAuth 型整合不受影響 |
| 物件儲存（上傳／預覽／截圖／快照／倉儲匯出） | R2 bucket | **完全不宣告 R2 綁定**；所有 `env.R2_BUCKET` 存取點加守卫，回 501 / `ENOR2` 明確錯誤，不會 crash（詳見下方專節） |
| 網頁截圖／瀏覽器操作 | Browser Rendering（`BROWSER`） | 截圖佇列與渲染路徑刪除 |
| Slack／Discord 訊息通道 | Queues、Discord bridge 服務綁定 | 佇列處理器與路由刪除（僅保留安全的 no-op 介面） |
| 自動化 Workflow | Workflows 綁定 | 類別保留為佔位，呼叫即明確報錯 |

> 說明：上列表章的 **UI 入口與 API 路由都已移除**；少數仍被底層引用的模組改寫為「Free Tier 佔位模組」，只留型別與符號，實際呼叫會拋出 `Free Tier：已移除○○` 的明確錯誤，不會靜默失敗。

### 為什麼不綁 R2（即使 R2 有免費額度）

R2 本身有免費額度（10 GB-month 儲存、每月 100 萬次 Class A、1000 萬次 Class B、egress 免費），但本部署刻意不使用，原因是：

1. **啟用 R2 必須先登記付款方式（信用卡）**，與「Free Tier 不需信用卡」的目標直接衝突；
2. 免費額度是**計費門檻而非硬限制**——Class A/B 操作次數或其他額度一旦超出就開始扣費，不會自動阻擋，也就不是真正的 free。

因此 `wrangler.jsonc` **完全沒有 `r2_buckets` 區塊**，執行期 `env.R2_BUCKET` 恆為 `undefined`；型別上一律宣告為選填（`R2_BUCKET?: R2Bucket`），每個存取點都有守卫。

連帶不可用的功能與其實際行為：

| 功能 | 無 R2 時的行為 |
|------|---------------|
| 工作區檔案上傳／下載／預覽（`user-uploads`、`user-outputs`） | 回 **501**，訊息註明 storage 不可用 |
| 已部署 app 的預覽截圖 | 標記 `failed`，`preview_error` 寫明缺 `R2_BUCKET` 綁定 |
| Email / Slack / Telegram 附件保存 | **略過該附件**，訊息本身仍正常處理 |
| 專案原始碼快照（建立／還原） | 拋出明確錯誤；「刪除快照」仍會清掉 KV 中繼資料，只是沒有 blob 可刪 |
| 聊天中大圖片外部化 | 保留 inline 資料，不外掛到物件儲存 |
| App 預覽（`/api/apps/:scriptName/preview`） | 回 **501** |
| Admin 物件瀏覽（`/api/admin/r2/*`） | 回 **501** |
| 倉儲匯出（`WAREHOUSE_EXPORT_BUCKET`） | 已隨 SQL 查詢容器一併移除 |
| 組織／工作區刪除時的 R2 清理 | no-op（沒有物件可清） |

> `src/lib/workspace-r2-paths.ts` 予以保留：它只是**純字串路徑產生器**（`buildWorkspaceScopedR2Key`），不觸碰 R2 API，被 12 個以上檔案與測試共用。

---

## ☁️ 快速部署：Cloudflare 面板連接 GitHub

以下步驟將 GitHub 倉庫與 Cloudflare Workers 綁定並一鍵部署。

### 步驟 1：KV / D1 綁定（不需填 ID，也不要把 ID 寫進程式碼）

`wrangler.jsonc` 只宣告 **binding 名稱**，不寫任何 resource id：

```jsonc
"kv_namespaces": [{ "binding": "SESSIONS" }, { "binding": "APP_KV" }, { "binding": "EMAIL_TO_USER" }],
"d1_databases":  [{ "binding": "APP_DB", "database_name": "camelai-db", "migrations_dir": "migrations" }]
```

首次部署時 Wrangler 會**自動建立**這些 KV namespace 與 D1 資料庫（Automatic provisioning），並把它們列在項目的 **Settings → Bindings**（KV Namespace / D1 Database 區塊）——這才是綁定該待的地方。透過 GitHub／面板觸發的部署，資源 id 只會保留在面板，**不會寫回 repo**，所以程式庫裡看不到任何明文 id。

> 若你想自己先在面板建好資源（Workers & Pages → Storage & Databases → KV / D1），只要名稱對得上即可；綁定仍舊顯示在 Settings → Bindings，不需要修改 repo 檔案。

另外已設定 `"keep_vars": true`，因此在面板 **Variables and secrets** 填的字串變數與 secret **不會**被後續部署覆蓋。

部署成功後，D1 是空的，需要套用一次資料表結構（二擇一）：
- 面板：D1 資料庫 → **Console**，依序貼上 `migrations/0001_app_index.sql` ～ `0004_*.sql` 的內容並執行（DDL 為 `CREATE TABLE IF NOT EXISTS`，可重複執行）
- 本地：`npx wrangler login` 後執行 `npx wrangler d1 migrations apply camelai-db --remote`

### 步驟 2：連接 Cloudflare 面板

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 進入 **Workers & Pages**。
3. 點擊 **`Connect to Git`**（或 `Create a Project` → `Import from Git`）。
4. 選擇 **GitHub**，授權後選擇倉庫：
   - **Repository**: `scupro/CamelAI`
   - **Branch**: `main`
5. 點擊 `Start Setup`。

---

## 🔌 Step 3：綁定對照表（綁定顯示在面板 Settings → Bindings）

`wrangler.jsonc` 只宣告 binding **名稱**（不含 id），部署時由 Wrangler 自動建立並綁定資源；完成後到項目的 **Settings → Bindings** 就能看到下列條目，右側會顯示它所指向的 KV／D1 實例與 id（id 只存在面板，不進 repo）。

| 綁定名稱 | 類型 | 說明 | 程式碼中訪問方式 |
|----------|------|------|------------------|
| `SESSIONS` | KV Store | 儲存聊天會話狀態（每次訊息的上下文） | `env.SESSIONS`（KVNamespace 實例） |
| `APP_KV` | KV Store | 儲存應用級設定與緩存 | `env.APP_KV`（KVNamespace 實例） |
| `EMAIL_TO_USER` | KV Store | 儲存用戶 email → user_id 映射 | `env.EMAIL_TO_USER`（KVNamespace 實例） |
| `APP_DB` | D1 Database | 關係數據庫，存放 users / orgs / threads 等核心表 | `env.APP_DB`（D1Database 實例） |
| `AI` | AI | Cloudflare Workers AI（自動注入，不需要手動綁） | `env.AI`（AI 對象） |
| `CHAT_THREAD`、`USER`、`ORG`… | Durable Object | 11 個 DO 類別，同屬本 Worker | `env.CHAT_THREAD`（DurableObjectNamespace） |

**注意**：
- 綁定**不需要**在 repo 內填 id；把 id 寫死在設定檔會讓同一份程式碼無法在其他 account 部署，也沒有必要。
- 只有當你把某資源的 id 明確寫進 `wrangler.jsonc` 時，部署才会去綁定那個既定資源（此時若 id 不存在便會報 `KV namespace '<id>' not found [code: 10041]`）。本專案刻意不這麼做。
- 字串配置與 secret 放在 **Variables and secrets**（Step 4），且已設 `keep_vars: true`，部署不會把面板上填的內容洗掉。

> **綁定成功後**，程式碼裡拿到的是**已連接好的資源實例**，不是字串。例如 `await env.SESSIONS.put(...)` 直接調用 KV 的 put 方法，`await env.APP_DB.prepare(...)` 直接執行 SQL。

---

## 🔤 Step 4：設定 Variables 與 Secrets

字串變數與 secret 都放在 **Workers & Pages → 你的項目 → Settings → Variables and secrets**。
`wrangler.jsonc` 已設 `keep_vars: true`，因此部署不會洗掉你在這裡填的內容。

> 底下每項都是**依目前程式碼實際讀取情形**列出的，不是範例清單。
> 自查方式：`grep -rn "env\.<名稱>" src workers --include="*.ts"`。

### A. 必填 secret（缺了會直接 throw，核心功能不可用）

| 變量名 | 用途 | 程式碼證據 |
|--------|------|-----------|
| `INTEGRATION_SECRET_KEY` | 加解密 BYOK 與第三方整合憑證 | `workers/main/src/identity/org-do.ts:5145` → `throw new Error("INTEGRATION_SECRET_KEY binding is not configured")`；`workers/main/src/ai-virtual-binding.ts:264` 同樣檢查 |
| `TOKEN_SIGNING_SECRET` | 簽發／驗證 session token | `src/lib/auth-helpers.ts:30` 型別宣告為必填 `string`；`src/lib/auth-do.ts:201,235,267`、`src/lib/auth.server.ts:184` 直接使用 |

**用指令建立**（在本機 repo 目錄執行；`wrangler secret put <key>` 從 stdin 讀值，可直接管線接）：

```bash
openssl rand -hex 32 | npx wrangler secret put INTEGRATION_SECRET_KEY
openssl rand -hex 32 | npx wrangler secret put TOKEN_SIGNING_SECRET
```

> 走 Workers Builds（面板連 GitHub）時，wrangler 用面板登入身分，不需額外設定；
> 若改走 GitHub Actions + `wrangler-action`，才需要在 repo secrets 放 `CF_ACCOUNT_ID` / `CF_API_TOKEN`。

### B. 必填字串變數

| 變量名 | 值示例 | 說明 |
|--------|--------|------|
| `WORKER_BASE_URL` | `https://camelai.<你的子網域>.workers.dev` | 對外 base URL。程式碼有 fallback（`?? ""`、`\|\| "https://camelai.dev"`）所以**不會 throw**，但填錯會讓 email 連結（`src/lib/email.server.ts:108`）、`agent-mcp` base（`workers/main/src/routes/agent-mcp.ts:262`）、workspace app fetch（`workers/main/src/workspace-app-fetcher.ts:191`）全部指向錯的網域。非機密，用 **Text** 型別填即可 |

```bash
printf 'https://camelai.<你的子網域>.workers.dev' | npx wrangler secret put WORKER_BASE_URL
```

### C. 選填（只在啟用該功能時才需要）

| 變量名 | 何時需要 |
|--------|---------|
| `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`CF_ZONE_ID` | 用到「刪除已部署 app」「cf-api-proxy」等需打 Cloudflare API 的功能。缺值時 `src/lib/deployed-app-delete.server.ts:116` → `throw "Server configuration error: Missing Cloudflare credentials"` |
| `CF_GATEWAY_NAME`、`CF_GATEWAY_TOKEN`、`AI_GATEWAY_AUTH_TOKEN` | 流量走 AI Gateway 時 |
| `NOTION_CLIENT_ID`、`NOTION_CLIENT_SECRET` | Notion 整合 |
| `SLACK_CLIENT_ID`、`DISCORD_CLIENT_ID` | Slack / Discord 整合 |
| `AGENT_RUNTIME_API_TOKEN` | agent runtime 對外 API 驗證 |
| `SELFHOST_AI_PROVIDER`、`SELFHOST_AI_API_KEY`、`SELFHOST_AI_BASE_URL`、`SELFHOST_AI_MODEL`、`SELFHOST_AI_NAME`、`SELFHOST_AI_AUTH_TYPE`、`SELFHOST_AI_API`、`SELFHOST_AI_AWS_REGION` | **外接 AI 提供者（openai / anthropic / openrouter / bedrock / custom）走這一組**，型別定義在 `src/lib/selfhost-ai-provider.ts:11-22`。`SELFHOST_AI_PROVIDER` 必填，且只能是 `anthropic`、`bedrock`、`custom`、`openai`、`openrouter` 之一；只填其他 `SELFHOST_AI_*` 卻漏填它，程式會回 `"SELFHOST_AI_PROVIDER is required when SELFHOST_AI_* variables are set."`。`SELFHOST_AI_API_KEY` 請用 **Secret** 型別。注意名稱是 `SELFHOST_AI_PROVIDER`，**不是** `AI_PROVIDER`。可用的免費模型清單見 [`docs/free-models.md`](docs/free-models.md) |
| `LOCAL_AUTH_BYPASS`、`LOCAL_AUTH_BYPASS_HOSTS` | 僅本機開發跳過登入；程式碼另外要求請求必須來自 localhost（`src/lib/auth.server.ts:298-310`）。**生產環境不要設** |

### D. 舊版 README 列過、但程式碼其實沒讀的變數（設了沒作用）

`AI_PROVIDER`、`AGENT_MODEL`、`AI_VIRTUAL_MODEL`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`

這些是早期玩具版的殘留。實測命中數：`AGENT_MODEL` / `AI_VIRTUAL_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL` 皆 **0 次**；
`AI_PROVIDER` 的 16 次命中全是常數與 `SELFHOST_AI_PROVIDER`，`LLM_MODEL` 的 82 次命中全是
`CAMEL_CODE_LLM_MODEL` / `LLM_MODEL_OPTIONS` 這類程式內常數，都不是環境變數讀取。


## 🚀 Step 5：首次部署

- 本專案是 **Cloudflare Worker**（SSR + 靜態資源，由 `wrangler.jsonc` 驅動），**不是 Pages 專案**，因此沒有「Build Output Directory」欄位，請不要按 Pages 流程填 `dist`。
- 建立專案時選擇 **Workers & Pages → Workers → Connect to Git**（Workers Builds）。
- Build command 設為 `npm run build`（會先建 notebook renderer，再跑 `react-router build`，產出 `build/client` + `build/server`）。
- Deploy command 設為 `npx wrangler deploy`（或直接留空，由 `wrangler.jsonc` 自動部署）。
- 點擊 **`Deploy`**，等待約 2-4 分鐘。
- 完成後會給出訪問 URL（如 `https://camelai.<account>.workers.dev`）。

## 💬 Step 6：使用

- 打開上面的 URL，看到 Web UI，可輸入問題。
- 每次發訊息，Worker 從 KV 讀會話上下文，透過 Workers AI 推理並回覆。
- `git push` 到 `main` 時 Cloudflare 會自動重新部署（`.github/workflows/deploy.yml` 已開啟 `workflow_dispatch` + `push` 觸發）。

## 🔧 後續操作

- **手動重新部署**：面板項目頁點 `Deploy`，隨時可以輸入新的變量值後重新部署。
- **檢視日誌**：Workers & Pages → `Deployments` → 選最近一次 → `Logs`。
- **D1 空間**：Free Tier 500 MB/庫，個人使用幾乎佔不滿。

---

## 📁 項目結構（精簡版）

```
CamelAI/
├── .gitignore                # 忽略 build 輸出
├── package.json              # 依賴與 build:cf 腳本（純 npm，不用 bun）
├── wrangler.jsonc            # Free Tier 配置：D1 + KV + AI + DO，無 R2/container/queue
├── react-router.config.ts    # React Router 框架設定（appDirectory: src、SSR）
├── vite.config.ts            # Vite + @cloudflare/vite-plugin
├── src/                      # React Router 前端（UI、routes、lib；完整 camelAI Web UI）
├── workers/main/             # 主 Worker：API、Durable Objects、認證、聊天執行緒
├── public/                   # 靜態資源（含 notebook-renderer 產物）
├── scripts/                  # 建置與部署輔助腳本
├── migrations/               # D1 schema
└── .github/workflows/deploy.yml
```

---

## ⚠️ Free Tier 已知限制

| 資源 | 免費層額度 | 備註 |
|------|-----------|------|
| **日請求** | 100,000 (UTC 重置) | Workers & Pages → Analytics 監控 |
| **CPU** | 每次 15s（預設） | 長時間 AI 推理請拆分 |
| **D1 單庫大小** | 500 MB/庫 | 個人使用幾乎佔不滿 |
| **D1 每日讀/寫** | 1,000,000 次/天/庫 | 同上 |
| **KV 存儲** | 1 GB 寫/日、10 億讀/天 | 會話狀態極小 |
| **Workers AI** | 每日 10,000 Neurons | 純 Workers AI 夠，外接視額度 |

---

## 🙋‍♂️ 常見問題

**Q: 沒有 Cloudflare Workers 經驗，會不會很難設置？**  
**A**: 不難。整個流程會點按鈕 + 在 Variables 裡填幾行字串，Cloudflare 自動 Build + Deploy，全程約 5 分鐘。

**Q: 面板創建的 D1/KV 是雲端數據嗎？以後想改用本地 `wrangler` 怎麼辦？**  
**A**: 是真實雲端數據，與本地無關。若改用本地 `wrangler`，可 `npx wrangler d1 clone camelai-db ./local-db` 克隆到本地，但個人 Free Tier 用面板操作即可，無需額外設置。

**Q: 想外接 OpenAI / Anthropic / OpenRouter 怎麼辦？**  
**A**: 用 `SELFHOST_AI_*` 這一組，**不是** `LLM_API_KEY` / `AI_PROVIDER`——後者程式碼根本沒讀（見 Step 4 的 D 段）。以外接 OpenAI 為例：

```bash
printf 'openai'        | npx wrangler secret put SELFHOST_AI_PROVIDER
printf 'sk-你的金鑰'    | npx wrangler secret put SELFHOST_AI_API_KEY
printf 'gpt-4o-mini'   | npx wrangler secret put SELFHOST_AI_MODEL
```

`SELFHOST_AI_PROVIDER` 可填 `anthropic`、`bedrock`、`custom`、`openai`、`openrouter`；走 `custom` / `openrouter` 時另填 `SELFHOST_AI_BASE_URL`。完整驗證邏輯見 `src/lib/selfhost-ai-provider.ts`。

**想先用免費模型？** 見 [`docs/free-models.md`](docs/free-models.md)——內含 OpenRouter（19 個免費模型，含 `cohere/north-mini-code:free`）、Groq（免費方案僅 `openai/gpt-oss-120b`、`openai/gpt-oss-20b`、`qwen/qwen3.8-27b`；注意 `llama-3.3-70b-versatile` 已改為 Enterprise 不再免費）、Cohere（試用金鑰每月僅 1,000 次呼叫）的實測清單、速率限制與接法。

---

## 📜 授權

- 修改自：[qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）
- 本項目：MIT License

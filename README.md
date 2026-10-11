# CamelAI (Free Tier Edition)

**個人用途的 AI Coding Assistant**，基於 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 修改而成，針對 Cloudflare Workers Free 層精簡：移除 R2、Sandbox 容器、Billing 及複雜功能，保留核心 AI 代理與 Durable Objects 架構。

**部署方式**：透過 **Cloudflare 面板連接 GitHub** 部署（Workers Builds）。KV／D1 在 `wrangler.jsonc` 只宣告 **binding 名稱**，部署時自動建立資源，綁定與 id 都呈現在面板 **Settings → Bindings**（repo 內不留任何 id）；配置**字串**與 secret 則放在 **Variables and secrets**，兩者位置不同、機制不同。

---

## 📦 上游來源

本項目修改自 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）：
- 原項目：`an AI coding assistant platform built on Cloudflare Workers and Durable Objects`
- 修改原因：原項目依賴 R2、Durable Objects 容器、Queues 等付費／高階資源，無法完全在 Free 層運行
- 本項目保留核心：Durable Objects（ChatThreadDO、UserDO、OrgDO、SignupDO、WorkspaceDO、WorkspaceFilesystemDO 等）、D1 資料庫、KV 命名空間、Workers AI、完整 React Router Web UI

### 已刪除的高階／付費功能

| 功能 | 相關資源 | 處理方式 |
|------|----------|----------|
| 計費／訂閱／額度 | Stripe、paywall、credit packs、用量限額 | 頁面與 API 路由刪除；殘存的方案／限額介面一律視為「未受限」 |
| Notebook 與程式碼執行 | Sandbox 容器（`ANALYSIS_SANDBOX`） | 執行路徑刪除；`.ipynb` 唯讀預覽仍保留（純靜態渲染） |
| 專案建置與部署 | 建置容器（`PROJECT_BUILD_SANDBOX`）、Dispatch Nest、Worker Loader | 部署／建置流程刪除 |
| SQL 連線查詢 | 查詢容器（`DB_QUERY_SANDBOX`）、DB egress relay | 查詢與倉儲匯出刪除；其他 OAuth 型整合不受影響 |
| 大檔暫存／倉儲匯出 | R2 bucket | 匯出與暫存路徑刪除 |
| 網頁截圖／瀏覽器操作 | Browser Rendering（`BROWSER`） | 截圖佇列與渲染路徑刪除 |
| Slack／Discord 訊息通道 | Queues、Discord bridge 服務綁定 | 佇列處理器與路由刪除（僅保留安全的 no-op 介面） |
| 自動化 Workflow | Workflows 綁定 | 類別保留為佔位，呼叫即明確報錯 |

> 說明：上列表章的 **UI 入口與 API 路由都已移除**；少數仍被底層引用的模組改寫為「Free Tier 佔位模組」，只留型別與符號，實際呼叫會拋出 `Free Tier：已移除○○` 的明確錯誤，不會靜默失敗。

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

## 🔤 Step 4：設定 Environment Variables（字串配置）

**這是字串變數的位置**，跟綁定分開。進入 Workers & Pages → 你的項目 → **Settings → Variables**：

### 必填（決定項目能否正常工作）

| 變量名 | 說明 | 值示例 |
|--------|------|--------|
| `AI_PROVIDER` | 選擇 AI 提供者 | `workers_ai`（預設，用 Cloudflare 內建 AI） 或 `openrouter`（外接） |

### 可選（有預設值，不改也能跑）

| 變量名 | 預設值 | 說明 |
|--------|--------|------|
| `AGENT_MODEL` | `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | Workers AI 使用的模型 |
| `AI_VIRTUAL_MODEL` | `dynamic/auto` | Workers AI 自動選模型（一般不改） |
| `LLM_API_KEY` | 空（僅當外接時必填） | 外部 LLM 的 API Key |
| `LLM_BASE_URL` | `https://api.openrouter.ai/v1` | 外部 LLM 的 Base URL |
| `LLM_MODEL` | `deepseek/deepseek-chat-v3-0324` | 外部 LLM 使用的模型 |

### 僅 GitHub Actions + wrangler-action 需要（面板直連時可留空）

| 變量名 | 說明 |
|--------|------|
| `CF_ACCOUNT_ID` | Cloudflare 賬號 ID |
| `CF_API_TOKEN` | Cloudflare API Token |

---

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

**Q: 想外接 OpenAI 怎麼辦？**  
**A**: 在 Variables 裡填 `LLM_API_KEY`、`LLM_BASE_URL`，並將 `AI_PROVIDER` 設為 `openrouter`，程式碼自動切換到外接模式。

---

## 📜 授權

- 修改自：[qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）
- 本項目：MIT License

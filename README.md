# CamelAI (Free Tier Edition)

**個人用途的 AI Coding Assistant**，基於 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 修改而成，針對 Cloudflare Workers Free 層精簡：移除 R2、Sandbox 容器、Billing 及複雜功能，保留核心 AI 代理與 Durable Objects 架構。

**部署方式**：透過 **Cloudflare 面板連接 GitHub** 部署（Workers Builds）。KV / D1 在 **Bindings** 裡綁定，配置字串在 **Variables** 裡填寫，兩者位置不同，機制不同。首次部署後需執行 `migrations/` 底下的 D1 schema（`npx wrangler d1 migrations apply camelai-db`，或將 SQL 貼進面板 SQL 主控台逐一執行）。

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

### 步驟 1：連接 Cloudflare 面板

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 進入 **Workers & Pages**。
3. 點擊 **`Connect to Git`**（或 `Create a Project` → `Import from Git`）。
4. 選擇 **GitHub**，授權後選擇倉庫：
   - **Repository**: `scupro/CamelAI`
   - **Branch**: `main`
5. 點擊 `Start Setup`。

---

## 🔌 Step 3：設定 Bindings（綁定雲資源）

**這是綁定的位置**，跟變數分開。進入 Workers & Pages → 你的項目 → **Settings → Bindings**：

| 綁定名稱 | 類型 | 說明 | 程式碼中訪問方式 |
|----------|------|------|------------------|
| `SESSIONS` | KV Store | 儲存聊天會話狀態（每次訊息的上下文） | `env.SESSIONS`（KVNamespace 實例） |
| `APP_KV` | KV Store | 儲存應用級設定與緩存 | `env.APP_KV`（KVNamespace 實例） |
| `EMAIL_TO_USER` | KV Store | 儲存用戶 email → user_id 映射 | `env.EMAIL_TO_USER`（KVNamespace 實例） |
| `APP_DB` | D1 Database | 關係數據庫，存放 users / orgs / threads 等核心表 | `env.APP_DB`（D1Database 實例） |
| `AI` | AI | Cloudflare Workers AI（自動注入，不需要手動綁） | `env.AI`（AI 對象） |

**操作方式**：
- KV：在 **Bindings → KV** 裡 `Create a namespace` → 起名為 `SESSIONS` / `APP_KV` / `EMAIL_TO_USER` → 系統自動綁到當前 Worker。
- D1：在 **Bindings → D1** 裡 `Create a database` → 起名為 `APP_DB` → 系統自動綁。
- **無需**在別的地方填寫 ID，Cloudflare 會自動把資源注入 `env.` 對象。

> **綁定後**程式碼裡拿到的是**已連接好的資源實例**，不是字串。例如 `await env.SESSIONS.put(...)` 直接調用 KV 的 put 方法，`await env.APP_DB.prepare(...)` 直接執行 SQL。

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
├── .gitignore                # 忽略 build 輸出與金鑰
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

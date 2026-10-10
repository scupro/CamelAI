# camelAI (Free Tier Edition)

**個人用途的 AI Coding Assistant**，基於 [camelAI](https://github.com/qaml-ai/camelAI) 修改而成，針對 Cloudflare Workers Free 層精簡：移除 R2 對象存儲、Sandbox 容器、Billing 及複雜功能，保留核心 AI 代理與 Durable Objects 架構。

## 上游來源

本項目修改自 [qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）：
- 原項目：`an AI coding assistant platform built on Cloudflare Workers and Durable Objects`
- 修改原因：原項目依賴 R2、Durable Objects 容器、Queues 等付費/高級功能，無法完全在 Free 層運行
- 本項目保留核心：Durable Objects（ChatThreadDO）、D1 數據庫、KV 命名空間、Workers AI

## 功能

### 保留的核心功能
- **Durable Objects 聊天會話**：ChatThreadDO 持久化聊天狀態
- **AI Coding Agent**：workspace-aware 的 AI 代理（可接 Claude/OpenAI 等）
- **D1 數據庫**：存儲項目文件與會話歷史（免費層 5GB）
- **KV 命名空間**：快速鍵值存取（免費層 10 億讀/天）
- **React 前端**：Web 界面顯示聊天與代碼編輯
- **HTTP/SSE 傳輸**：實時消息流

### 移除的功能（不支援）
- **R2 對象存儲**：文件存儲改用 D1 BLOB 或外部免費方案
- **Sandbox 容器**：項目構建、Notebook、SQL 執行需 Linux 容器
- **Billing 系統**：無費用追蹤、無應用隔離
- **複雜的隊列系統**：Slack/Discord 事件處理簡化或禁用
- **多組織/多工作區**：單一使用者模式

### 新增/簡化
- **精簡配置**：只需 D1 + KV + Workers AI，無需 R2
- **本地開發**：`wrangler dev` 可完整測試（D1/KV 本地模擬器）
- **Free 層優化**：請求限制、CPU 限制自適應

## 目錄結構

```
camelai-free-tier/
├── wrangler.jsonc           # Cloudflare 配置（D1/KV/Workers AI）
├── package.json             # 依賴與腳本（已精簡）
├── src/
│   └── index.ts             # Worker 入口（路由 + AI 代理邏輯）
├── workers/
│   ├── main/
│   │   └── src/
│   │       ├── ChatThreadDO.ts      # Durable Object：聊天會話
│   │       ├── UserDO.ts            # Durable Object：用戶狀態
│   │       └── WorkspaceFilesystemDO.ts  # Durable Object：文件系統
│   └── dispatcher/
│       └── index.ts             # 應用分發器（簡化版）
├── migrations/
│   └── 0001_init.sql      # D1 數據庫初始化
└── public/
    ├── index.html           # 前端頁面
    └── app.js               # 前端邏輯
```

## 快速開始

### 1. 安裝依賴並登錄

```bash
cd camelai-free-tier
npm install
npx wrangler login
```

### 2. 創建 D1 數據庫與 KV

```bash
# D1 數據庫（存會話和文件）
npx wrangler d1 create camelai-db

# KV 命名空間（存狀態和緩存）
npx wrangler kv:namespace create APP_KV
npx wrangler kv:namespace create SESSIONS
npx wrangler kv:namespace create EMAIL_TO_USER
```

將輸出的 ID 填入 `wrangler.jsonc`：

```jsonc
"d1_databases": [{ "binding": "APP_DB", "database_id": "<你的D1 ID>", "database_name": "camelai-db" }],
"kv_namespaces": [
  { "binding": "APP_KV", "id": "<KV ID 1>" },
  { "binding": "SESSIONS", "id": "<KV ID 2>" },
  { "binding": "EMAIL_TO_USER", "id": "<KV ID 3>" }
]
```

### 3. 應用 D1 遷移

```bash
npx wrangler d1 migrations apply camelai-db
```

### 4. 配置 AI 金鑰（選用）

```bash
# 使用 Cloudflare AI Gateway（推薦）
npx wrangler secret put AI_GATEWAY_TOKEN

# 或外接 LLM API（OpenAI/Claude/DeepSeek 等）
npx wrangler secret put LLM_API_KEY
# 可在 wrangler.jsonc vars 設定：
#   "LLM_BASE_URL": "https://api.openrouter.ai/v1",
#   "LLM_MODEL": "deepseek/deepseek-chat-v3-0324"
```

### 5. 部署

```bash
npx wrangler deploy
```

打開 `https://camelai-free.<你的子域>.workers.dev` 即可使用。

## 本地開發

```bash
npx wrangler dev
# 打開 http://localhost:8787
```

本地開發時 D1/KV 使用 Cloudflare 模擬器，數據存於 `.wrangler/`。

## Free 層限制提醒

| 資源 | Free 額度 | 用途 |
|------|---------|------|
| 日請求 | 100,000（UTC 重置） | 核心 API |
| CPU | 每次 15s | 避免長運算 |
| D1 存儲 | 5GB | 會話 + 文件 |
| D1 行讀 | 500M/日 | 數據查詢 |
| KV 存儲 | 1GB 寫/日 | 狀態 + 緩存 |
| KV 行讀 | 10 億/日 | 快速讀取 |
| Workers AI | 每日 10,000 Neurons | LLM 推理 |

**建議**：
- 監控日請求數，接近 100k 時升級 Paid（$5/月）或分散多 Worker
- CPU 限制 15s：長時間 AI 推理可拆成多輪、使用 SSE 流式
- D1 存儲 5GB：定期清理舊會話（設 TTL 或寫清理腳本）

## 與原項目差異

| 項目 | 原 camelAI | 本項目 |
|------|-----------|--------|
| R2 | 存項目文件 | **移除**（D1 BLOB 代替） |
| 容器 | 構建/Notebook/SQL | **移除** |
| Billing | 費用追蹤 + 應用隔離 | **移除** |
| 隊列 | Slack/Discord 事件 | **簡化/禁用** |
| 多組織 | 支持 | **不支持**（單用戶） |
| D1/KV | 支持 | **保留** |
| Workers AI | 支持 | **保留** |
| Free 層 | 部分支援 | **完整支援** |

## 授權

- 修改自：[qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)（MIT License）
- 本項目：MIT License

## 貢獻者

- 原項目：qaml-ai 團隊
- 修改：本項目維護者（個人 Free 層版本）

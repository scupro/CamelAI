/**
 * camelAI Free Tier - 類型定義
 */

export interface Env {
  // D1
  APP_DB: D1Database;

  // KV
  SESSIONS: KVNamespace;
  APP_KV: KVNamespace;
  EMAIL_TO_USER: KVNamespace;

  // Workers AI
  AI: AI;

  // 配置
  AI_PROVIDER?: string;
  AGENT_MODEL?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

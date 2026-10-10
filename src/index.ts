/**
 * camelAI Free Tier - 主 Worker 入口
 * 基於 https://github.com/qaml-ai/camelAI 修改
 * 移除 R2、容器、Billing，僅保留 D1 + KV + Durable Objects
 */

import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 靜態資源（React 前端）
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <title>camelAI Free</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    #messages { border: 1px solid #ccc; padding: 16px; min-height: 300px; }
    #input { width: 70%; padding: 8px; }
    #send { padding: 8px 16px; cursor: pointer; }
    .msg { margin: 8px 0; }
    .user { color: #0066cc; }
    .ai { color: #009900; }
  </style>
</head>
<body>
  <h1>camelAI Free Tier</h1>
  <p>AI Coding Assistant — 個人版（基於 Cloudflare Workers Free）</p>
  <div id="messages"></div>
  <div>
    <input id="input" placeholder="輸入你的問題..." autofocus>
    <button id="send">發送</button>
  </div>
  <script>
    let sessionId = localStorage.getItem('sessionId') || crypto.randomUUID();
    localStorage.setItem('sessionId', sessionId);
    const msgs = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    async function chat() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      msgs.innerHTML += '<div class="msg user">' + escapeHtml(text) + '</div>';

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId },
          body: JSON.stringify({ message: text }),
        });
        const data = await resp.json();
        msgs.innerHTML += '<div class="msg ai">' + escapeHtml(data.response || data.error) + '</div>';
      } catch (e) {
        msgs.innerHTML += '<div class="msg ai" style="color:red">Error: ' + e.message + '</div>';
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    send.onclick = chat;
    input.onkeydown = (e) => { if (e.key === 'Enter') chat(); };
  </script>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // API 端點
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env, ctx);
    }

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', tier: 'free' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/state') {
      const sessionId = request.headers.get('X-Session-ID');
      if (!sessionId) return new Response('Missing X-Session-ID', { status: 400 });
      const raw = await env.SESSIONS.get(`chat:${sessionId}`);
      const messages = raw ? JSON.parse(raw) : [];
      return new Response(JSON.stringify({ sessionId, messages }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleChat(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await request.json();
  const message: string = body.message;
  const sessionId = request.headers.get('X-Session-ID') || 'default';

  // 載入歷史
  const raw = await env.SESSIONS.get(`chat:${sessionId}`);
  const messages: { role: string; content: string }[] = raw ? JSON.parse(raw) : [];

  // 追加用戶消息
  messages.push({ role: 'user', content: message });

  // 截斷歷史（避免超出 token 限制）
  const context = messages.slice(-10);

  // 調用 AI
  let aiResponse = '';
  // Auto-flow control: if disabled, skip AI response automatically
  let aiResponseSkipped = false;
  if (env.AUTO_FLOW === 'false') {
    aiResponse = 'Auto-flow is disabled. AI will not respond automatically. Change AUTO_FLOW to "true" or remove the env var to restore automatic AI responses.';
    aiResponseSkipped = true;
  }

  const provider = env.AI_PROVIDER || 'workers_ai';

  if (!aiResponseSkipped) {
    const model = env.AGENT_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
    try {
      const result = await env.AI.run(model, {
        messages: context.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 500,
        temperature: 0.7,
      });
      aiResponse = typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e: any) {
      aiResponse = `Workers AI error: ${e.message}. Check model availability or set LLM_API_KEY for fallback.`;
    }
  } else if (env.LLM_API_KEY) {
    // 外接 OpenAI 兼容 API
    const baseUrl = env.LLM_BASE_URL || 'https://api.openrouter.ai/v1';
    const model = env.LLM_MODEL || 'deepseek/deepseek-chat-v3-0324';
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: context.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 500,
        }),
      });
      const data = await resp.json();
      aiResponse = data.choices?.[0]?.message?.content || JSON.stringify(data);
    } catch (e: any) {
      aiResponse = `API error: ${e.message}`;
    }
  } else {
    aiResponse = 'No AI provider configured. Set AI_PROVIDER and relevant env vars.';
  }

  // 保存會話
  messages.push({ role: 'assistant', content: aiResponse });
  await env.SESSIONS.put(
    `chat:${sessionId}`,
    JSON.stringify(messages.slice(-20)),
    { expirationTtl: 60 * 60 * 24 * 7 } // 7 天 TTL
  );

  return new Response(JSON.stringify({ response: aiResponse, sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

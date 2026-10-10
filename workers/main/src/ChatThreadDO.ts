export default {
  name: 'ChatThreadDO',
  async fetch(request) {
    // 處理聊天會話請求
    const sessionId = request.headers.get('X-Session-ID');
    if (!sessionId) {
      return new Response('Missing session ID', { status: 400 });
    }

    // 從 KV 或 D1 載入會話狀態
    const state = await this.env.SESSIONS.get(`chat:${sessionId}`);
    const messages = state ? JSON.parse(state) : [];

    // 簡化的 AI 代理邏輯（可替換為完整代理循環）
    const response = await this.callAI(messages);

    // 保存新消息到 D1
    messages.push({ role: 'user', content: request.body?.text() });
    messages.push({ role: 'assistant', content: response });

    await this.env.SESSIONS.put(
      `chat:${sessionId}`,
      JSON.stringify(messages.slice(-10)) // 只保留最後 10 條
    );

    return new Response(JSON.stringify({ messages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async callAI(messages) {
    // 使用 Workers AI 或外接 API
    // 實際實現需根據配置選擇 provider
    const aiProvider = this.env.AI_PROVIDER || 'workers_ai';
    
    if (aiProvider === 'workers_ai') {
      // 調用 Cloudflare Workers AI
      const model = this.env.AGENT_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
      const response = await this.env.AI.run(model, {
        messages: messages.slice(-5), // 限制上下文
        max_tokens: 500,
      });
      return response;
    }
    
    // 外接 API 處理（省略，需實現 OpenAI 兼容格式）
    return 'AI response placeholder';
  },

  async alarm() {
    // 定時清理舊會話（選用）
    const cleanupTime = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await this.env.SESSIONS.delete(`cleanup:${cleanupTime}`);
  },
};

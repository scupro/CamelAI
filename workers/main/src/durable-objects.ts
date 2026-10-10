// 簡化版 Durable Objects 存根 - 僅保留核心類
// 實際上這些需從原 camelAI 複製並修改
// 此處為框架，實際部署時需補充完整實現

export class ChatThreadDO {
  async fetch(request: Request) {
    // 核心聊天會話邏輯
    // 實際實現見原 camelAI 項目
    return new Response('ChatThreadDO stub', { status: 501 });
  }

  async alarm() {
    // 定時清理
  }
}

export class UserDO {
  async fetch(request: Request) {
    // 用戶狀態管理
    return new Response('UserDO stub', { status: 501 });
  }
}

export class WorkspaceFilesystemDO {
  async fetch(request: Request) {
    // 文件系統操作（使用 D1 BLOB 代替 R2）
    return new Response('WorkspaceFilesystemDO stub', { status: 501 });
  }
}

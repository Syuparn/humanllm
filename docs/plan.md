# humanllm 設計案

## 概要

人間が LLM モデルの代わりとなり、OpenAI API 互換のエンドポイントへのリクエストに手動で返答するツール。

---

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                       API クライアント                        │
│  (Claude Code / curl / any OpenAI-compatible client)         │
└─────────────────┬───────────────────────────────────────────┘
                  │ POST /v1/chat/completions
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    humanllm サーバー (Node.js)                │
│                                                              │
│  ┌────────────────────┐    ┌──────────────────────────────┐ │
│  │  OpenAI 互換 API   │    │  WebSocket サーバー           │ │
│  │  (Hono)            │◄──►│  (リクエスト/レスポンス中継)  │ │
│  └────────────────────┘    └──────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ペンディングリクエスト管理 (In-memory Map)              │ │
│  │  requestId => { prompt, resolve, reject, createdAt }   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                  │ WebSocket
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  フロントエンド (Vite + React)                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  受信プロンプト表示エリア                                │ │
│  │  - messages (system / user / assistant) の会話履歴      │ │
│  │  - リクエストキュー（複数同時リクエスト対応）            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  人間の回答入力エリア                                    │ │
│  │  - テキストエリア                                       │ │
│  │  - 送信ボタン                                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## リクエストフロー

```
API Client          Server                WebSocket          Frontend (Human)
    │                  │                      │                     │
    │ POST /v1/chat/   │                      │                     │
    │ completions      │                      │                     │
    │─────────────────►│                      │                     │
    │                  │ requestId 生成        │                     │
    │                  │ resolve/reject を     │                     │
    │                  │ Map に保存           │                     │
    │                  │─────────────────────►│                     │
    │                  │                      │ WS message          │
    │                  │                      │ (type: "request",   │
    │                  │                      │  requestId,         │
    │                  │                      │  messages)          │
    │                  │                      │────────────────────►│
    │                  │                      │                     │ プロンプト表示
    │                  │                      │                     │ 人間が読む・考える
    │                  │                      │                     │ テキストエリアに入力
    │                  │                      │                     │ 送信ボタンクリック
    │                  │                      │◄────────────────────│
    │                  │◄─────────────────────│                     │
    │                  │ Map から resolve 取得 │                     │
    │◄─────────────────│                      │                     │
    │ 200 OK           │                      │                     │
    │ (OpenAI 形式)    │                      │                     │
```

---

## ディレクトリ構成

```
humanllm/
├── src/                        # フロントエンド (Vite + React)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── RequestQueue.tsx     # 待機中リクエスト一覧
│   │   ├── PromptDisplay.tsx    # 会話履歴の表示
│   │   └── ResponseInput.tsx    # 回答入力フォーム
│   ├── hooks/
│   │   └── useWebSocket.ts      # WebSocket 接続管理
│   └── types.ts                 # 共有型定義
│
├── server/                      # バックエンド (Node.js + Hono)
│   ├── index.ts                 # エントリポイント
│   ├── api/
│   │   └── chat.ts              # POST /v1/chat/completions
│   ├── ws/
│   │   └── handler.ts           # WebSocket ハンドラー
│   └── store/
│       └── pendingRequests.ts   # ペンディングリクエスト管理
│
├── docs/
│   └── plan.md
├── vite.config.ts               # proxy 設定追加
└── package.json
```

---

## API 仕様

### OpenAI 互換エンドポイント

#### `POST /v1/chat/completions`

**リクエスト:**
```json
{
  "model": "human",
  "messages": [
    { "role": "system", "content": "あなたは親切なアシスタントです。" },
    { "role": "user", "content": "東京の天気は？" }
  ],
  "stream": false
}
```

**レスポンス (stream: false):**
```json
{
  "id": "chatcmpl-xxxxxxxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "human",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "今日の東京は晴れです。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

> **Note:** streaming (`stream: true`) は MVP では未対応。将来対応可。

---

## WebSocket メッセージ仕様

### Server → Frontend

#### リクエスト通知
```json
{
  "type": "request",
  "requestId": "uuid-xxxx",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "model": "human",
  "createdAt": 1234567890
}
```

#### リクエストタイムアウト通知
```json
{
  "type": "timeout",
  "requestId": "uuid-xxxx"
}
```

### Frontend → Server

#### 人間の回答
```json
{
  "type": "response",
  "requestId": "uuid-xxxx",
  "content": "今日の東京は晴れです。"
}
```

---

## フロントエンド UI 設計

```
┌──────────────────────────────────────────────────────────────┐
│  humanllm                                          🟢 接続中  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [待機中リクエスト: 2件]                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ▶ リクエスト #1  (2秒前)                                │ │
│  │   リクエスト #2  (1秒前)   ← クリックで切り替え          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [会話履歴]                                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🔧 system                                               │ │
│  │ あなたは親切なアシスタントです。                          │ │
│  │                                                        │ │
│  │ 👤 user                                                │ │
│  │ 東京の天気は？                                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [あなたの回答]                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 今日の東京は晴れです。                                    │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                              [送信 (Ctrl+Enter)]             │
└──────────────────────────────────────────────────────────────┘
```

---

## 技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フロントエンド | Vite + React + TypeScript | 既存構成 |
| バックエンド | Node.js + Hono | 軽量・TypeScript ネイティブ・Web標準準拠 |
| WebSocket | `ws` ライブラリ | シンプルで安定 |
| 開発時プロキシ | Vite proxy | `/api/*` と `/ws` をサーバーへ転送 |

---

## 実装フェーズ

### Phase 1: MVP
- [ ] Hono サーバーのセットアップ (`server/index.ts`)
- [ ] `POST /v1/chat/completions` エンドポイント (non-streaming)
- [ ] WebSocket サーバーのセットアップ
- [ ] ペンディングリクエスト管理 (In-memory Map + Promise)
- [ ] フロントエンド: WebSocket 接続 (`useWebSocket` hook)
- [ ] フロントエンド: プロンプト表示コンポーネント
- [ ] フロントエンド: 回答入力・送信コンポーネント
- [ ] Vite proxy 設定

### Phase 2: UX 改善
- [ ] 複数同時リクエストのキュー表示
- [ ] リクエストタイムアウト (デフォルト 5 分)
- [ ] Ctrl+Enter で送信
- [ ] 接続状態インジケータ (接続中 / 切断)
- [ ] markdown レンダリング

### Phase 3: 機能拡張
- [ ] Streaming レスポンス対応 (`stream: true`)
- [ ] `/v1/models` エンドポイント
- [ ] リクエスト履歴の保存・表示

---

## 主要な実装ポイント

### ペンディングリクエスト管理

API リクエストを受けてから人間が回答するまで HTTP コネクションをホールドする必要があります。これを `Promise` で実装します。

```typescript
// server/store/pendingRequests.ts
type PendingRequest = {
  resolve: (content: string) => void;
  reject: (reason: Error) => void;
  messages: ChatMessage[];
  createdAt: number;
};

const pending = new Map<string, PendingRequest>();
```

```typescript
// server/api/chat.ts (概念コード)
app.post('/v1/chat/completions', async (c) => {
  const { messages, model } = await c.req.json();
  const requestId = crypto.randomUUID();

  const content = await new Promise<string>((resolve, reject) => {
    pending.set(requestId, { resolve, reject, messages, createdAt: Date.now() });
    broadcast({ type: 'request', requestId, messages });

    // タイムアウト処理
    setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('timeout'));
    }, 5 * 60 * 1000);
  });

  return c.json(buildOpenAIResponse(requestId, model, content));
});
```

### Vite プロキシ設定

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3000',  ws: true },
    }
  }
});
```

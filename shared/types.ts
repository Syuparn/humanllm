export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Server → Frontend
export type WsRequestMessage = {
  type: 'request'
  requestId: string
  messages: ChatMessage[]
  model: string
  createdAt: number
}

export type WsTimeoutMessage = {
  type: 'timeout'
  requestId: string
}

export type WsServerMessage = WsRequestMessage | WsTimeoutMessage

// Frontend → Server
export type WsResponseMessage =
  | { type: 'response'; requestId: string; content: string }
  | { type: 'delta'; requestId: string; content: string }

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ToolCallItem =
  | { type: 'function_call'; callId: string; name: string; arguments: string }
  | { type: 'local_shell_call'; callId: string; command: string[]; workingDirectory: string | null }

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
  | { type: 'function_call'; requestId: string; callId: string; name: string; arguments: string }
  | { type: 'local_shell_call'; requestId: string; callId: string; command: string[]; workingDirectory: string | null }

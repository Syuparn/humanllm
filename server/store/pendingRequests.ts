import type { ChatMessage } from '../../shared/types'

type PendingRequest = {
  resolve: (content: string) => void
  reject: (reason: Error) => void
  messages: ChatMessage[]
  createdAt: number
}

const pending = new Map<string, PendingRequest>()

export function addPending(
  requestId: string,
  messages: ChatMessage[],
  resolve: (content: string) => void,
  reject: (reason: Error) => void,
) {
  pending.set(requestId, { resolve, reject, messages, createdAt: Date.now() })
}

export function resolvePending(requestId: string, content: string): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  pending.delete(requestId)
  req.resolve(content)
  return true
}

export function rejectPending(requestId: string, reason: Error): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  pending.delete(requestId)
  req.reject(reason)
  return true
}

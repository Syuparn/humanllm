import type { ChatMessage } from '../../shared/types'

type PendingRequest = {
  sendDelta: (text: string) => void
  complete: (fullText: string) => void
  reject: (reason: Error) => void
  messages: ChatMessage[]
  createdAt: number
  accumulated: string
}

const pending = new Map<string, PendingRequest>()

export function addPending(
  requestId: string,
  messages: ChatMessage[],
  sendDelta: (text: string) => void,
  complete: (fullText: string) => void,
  reject: (reason: Error) => void,
) {
  pending.set(requestId, {
    sendDelta,
    complete,
    reject,
    messages,
    createdAt: Date.now(),
    accumulated: '',
  })
}

export function deltaPending(requestId: string, text: string): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  req.accumulated += text
  req.sendDelta(text)
  return true
}

export function resolvePending(requestId: string, finalText: string): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  pending.delete(requestId)
  if (finalText) {
    req.accumulated += finalText
    req.sendDelta(finalText)
  }
  req.complete(req.accumulated)
  return true
}

export function rejectPending(requestId: string, reason: Error): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  pending.delete(requestId)
  req.reject(reason)
  return true
}

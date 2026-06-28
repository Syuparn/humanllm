import type { ChatMessage, ToolCallItem } from '../../shared/types'

type PendingRequest = {
  sendDelta: (text: string) => void
  complete: (fullText: string) => void
  completeTool: ((item: ToolCallItem) => void) | null
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
  completeTool: ((item: ToolCallItem) => void) | null = null,
) {
  pending.set(requestId, {
    sendDelta,
    complete,
    completeTool,
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

export function resolveToolPending(requestId: string, item: ToolCallItem): boolean {
  const req = pending.get(requestId)
  console.log(`[store] resolveToolPending id=${requestId} type=${item.type} hasTool=${!!req?.completeTool}`)
  if (!req) return false
  pending.delete(requestId)
  if (req.completeTool) {
    req.completeTool(item)
  } else {
    console.error('[store] completeTool is null — endpoint does not support tool calls')
    req.reject(new Error('tool calls not supported for this endpoint'))
  }
  return true
}

export function rejectPending(requestId: string, reason: Error): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  pending.delete(requestId)
  req.reject(reason)
  return true
}

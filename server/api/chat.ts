import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ChatMessage } from '../../shared/types'
import { addPending, rejectPending } from '../store/pendingRequests'
import { broadcast } from '../ws/clients'

const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const app = new Hono()

app.use('*', cors())

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json<{
    model?: string
    messages: ChatMessage[]
    stream?: boolean
  }>()

  const { messages, model = 'human' } = body
  const requestId = crypto.randomUUID()
  const createdAt = Math.floor(Date.now() / 1000)

  const content = await new Promise<string>((resolve, reject) => {
    addPending(requestId, messages, resolve, reject)

    broadcast({
      type: 'request',
      requestId,
      messages,
      model,
      createdAt,
    })

    setTimeout(() => {
      const rejected = rejectPending(requestId, new Error('timeout'))
      if (rejected) {
        broadcast({ type: 'timeout', requestId })
      }
    }, TIMEOUT_MS)
  })

  return c.json({
    id: `chatcmpl-${requestId}`,
    object: 'chat.completion',
    created: createdAt,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  })
})

// OpenAI Responses API
app.post('/v1/responses', async (c) => {
  const body = await c.req.json<{
    model?: string
    input: string | Array<{ role: string; content: unknown }>
    stream?: boolean
  }>()

  const { model = 'human', input, stream = false } = body

  // content が {type, text}[] 形式の場合も文字列に正規化する
  const normalizeContent = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'object' && c !== null && 'text' in c ? (c as { text: string }).text : ''))
        .join('')
    }
    return String(content)
  }

  const messages: ChatMessage[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input.map((m) => ({ role: m.role as ChatMessage['role'], content: normalizeContent(m.content) }))

  const requestId = crypto.randomUUID()
  const respId = `resp_${requestId}`
  const msgId = `msg_${requestId}`
  const createdAt = Math.floor(Date.now() / 1000)

  const contentPromise = new Promise<string>((resolve, reject) => {
    addPending(requestId, messages, resolve, reject)

    broadcast({ type: 'request', requestId, messages, model, createdAt })

    setTimeout(() => {
      const rejected = rejectPending(requestId, new Error('timeout'))
      if (rejected) broadcast({ type: 'timeout', requestId })
    }, TIMEOUT_MS)
  })

  if (!stream) {
    const text = await contentPromise
    return c.json({
      id: respId,
      object: 'response',
      created_at: createdAt,
      model,
      status: 'completed',
      output: [{
        type: 'message',
        id: msgId,
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
        status: 'completed',
      }],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    })
  }

  // SSE ストリーミング
  const enc = new TextEncoder()
  const sseEvent = (event: string, data: object) =>
    enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent('response.created', {
        type: 'response.created',
        response: {
          id: respId, object: 'response', created_at: createdAt,
          status: 'in_progress', model, output: [],
        },
      }))

      controller.enqueue(sseEvent('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: msgId, type: 'message', role: 'assistant', content: [], status: 'in_progress' },
      }))

      controller.enqueue(sseEvent('response.content_part.added', {
        type: 'response.content_part.added',
        item_id: msgId, output_index: 0, content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      }))

      let text = ''
      try {
        text = await contentPromise
      } catch {
        controller.close()
        return
      }

      controller.enqueue(sseEvent('response.output_text.delta', {
        type: 'response.output_text.delta',
        item_id: msgId, output_index: 0, content_index: 0,
        delta: text,
      }))

      controller.enqueue(sseEvent('response.output_text.done', {
        type: 'response.output_text.done',
        item_id: msgId, output_index: 0, content_index: 0,
        text,
      }))

      controller.enqueue(sseEvent('response.output_item.done', {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: msgId, type: 'message', role: 'assistant',
          content: [{ type: 'output_text', text, annotations: [] }],
          status: 'completed',
        },
      }))

      controller.enqueue(sseEvent('response.completed', {
        type: 'response.completed',
        response: {
          id: respId, object: 'response', created_at: createdAt,
          status: 'completed', model,
          output: [{
            id: msgId, type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }],
            status: 'completed',
          }],
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        },
      }))

      controller.close()
    },
  })

  return c.body(readable, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
})

app.get('/v1/models', (c) => {
  return c.json({
    object: 'list',
    data: [
      {
        id: 'human',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'humanllm',
      },
    ],
  })
})

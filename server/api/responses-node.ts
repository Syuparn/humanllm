import type { IncomingMessage, ServerResponse } from 'http'
import type { ChatMessage } from '../../shared/types'
import { addPending, rejectPending } from '../store/pendingRequests'
import { broadcast } from '../ws/clients'

const TIMEOUT_MS = 5 * 60 * 1000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'object' && c !== null && 'text' in c ? (c as { text: string }).text : ''))
      .join('')
  }
  return String(content)
}

export async function handleResponsesNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  // Parse request body
  const raw = await new Promise<string>((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

  const body = JSON.parse(raw) as {
    model?: string
    input: string | Array<{ role: string; content: unknown }>
    stream?: boolean
  }

  const { model = 'human', input, stream = false } = body

  const messages: ChatMessage[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input.map((m) => ({ role: m.role as ChatMessage['role'], content: normalizeContent(m.content) }))

  const requestId = crypto.randomUUID()
  const respId = `resp_${requestId}`
  const msgId = `msg_${requestId}`
  const createdAt = Math.floor(Date.now() / 1000)

  if (!stream) {
    const text = await new Promise<string>((resolve, reject) => {
      addPending(requestId, messages, () => {}, resolve, reject)
      broadcast({ type: 'request', requestId, messages, model, createdAt })
      setTimeout(() => {
        const rejected = rejectPending(requestId, new Error('timeout'))
        if (rejected) broadcast({ type: 'timeout', requestId })
      }, TIMEOUT_MS)
    })

    const responseBody = JSON.stringify({
      id: respId, object: 'response', created_at: createdAt, model,
      status: 'completed',
      output: [{
        type: 'message', id: msgId, role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
        status: 'completed',
      }],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    })

    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS })
    res.end(responseBody)
    return
  }

  // SSE streaming — Node.js の HTTP レスポンス層を完全にバイパスし
  // TCP ソケットに直接書き込む（バッファリングなし）
  const socket = req.socket
  if (!socket) { res.writeHead(500); res.end(); return }

  socket.setNoDelay(true)

  // 生の HTTP レスポンスヘッダーをソケットへ直接書き込む
  const headerLines = [
    'HTTP/1.1 200 OK',
    'Content-Type: text/event-stream',
    'Cache-Control: no-cache',
    'Connection: keep-alive',
    ...Object.entries(CORS_HEADERS).map(([k, v]) => `${k}: ${v}`),
    '',
    '',
  ].join('\r\n')
  socket.write(headerLines)

  const writeSSE = (event: string, data: object) => {
    socket.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  writeSSE('response.created', {
    type: 'response.created',
    response: { id: respId, object: 'response', created_at: createdAt, status: 'in_progress', model, output: [] },
  })
  writeSSE('response.output_item.added', {
    type: 'response.output_item.added',
    output_index: 0,
    item: { id: msgId, type: 'message', role: 'assistant', content: [], status: 'in_progress' },
  })
  writeSSE('response.content_part.added', {
    type: 'response.content_part.added',
    item_id: msgId, output_index: 0, content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  })

  addPending(
    requestId,
    messages,
    (deltaText) => {
      writeSSE('response.output_text.delta', {
        type: 'response.output_text.delta',
        item_id: msgId, output_index: 0, content_index: 0,
        delta: deltaText,
      })
    },
    (fullText) => {
      writeSSE('response.output_text.done', {
        type: 'response.output_text.done',
        item_id: msgId, output_index: 0, content_index: 0, text: fullText,
      })
      writeSSE('response.output_item.done', {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: msgId, type: 'message', role: 'assistant',
          content: [{ type: 'output_text', text: fullText, annotations: [] }],
          status: 'completed',
        },
      })
      writeSSE('response.completed', {
        type: 'response.completed',
        response: {
          id: respId, object: 'response', created_at: createdAt,
          status: 'completed', model,
          output: [{
            id: msgId, type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: fullText, annotations: [] }],
            status: 'completed',
          }],
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        },
      })
      socket.end()
    },
    () => { socket.destroy() },
  )

  broadcast({ type: 'request', requestId, messages, model, createdAt })

  setTimeout(() => {
    const rejected = rejectPending(requestId, new Error('timeout'))
    if (rejected) broadcast({ type: 'timeout', requestId })
  }, TIMEOUT_MS)
}

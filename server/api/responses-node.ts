import type { IncomingMessage, ServerResponse } from 'http'
import type { ChatMessage, ToolCallItem } from '../../shared/types'
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

// Responses API input には role を持たない tool アイテム（function_call, function_call_output 等）が混在する。
// それらを ChatMessage に変換して人間が読める形にする。
// developer ロールは instructions 由来のシステムプロンプトなので system として扱う。
function normalizeInputItem(m: Record<string, unknown>): ChatMessage | null {
  const role = m.role as string | undefined
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return { role, content: normalizeContent(m.content) }
  }
  if (role === 'developer') {
    return { role: 'system', content: normalizeContent(m.content) }
  }
  const type = m.type as string | undefined
  if (type === 'function_call') {
    return { role: 'assistant', content: `[function_call: ${m.name}]\n${m.arguments ?? ''}` }
  }
  if (type === 'function_call_output') {
    return { role: 'user', content: `[function_call_output]\n${String(m.output ?? '')}` }
  }
  if (type === 'local_shell_call') {
    const action = m.action as { command?: string[] } | undefined
    return { role: 'assistant', content: `[local_shell_call: ${action?.command?.join(' ') ?? ''}]` }
  }
  if (type === 'local_shell_call_output') {
    return { role: 'user', content: `[local_shell_call_output]\n${String(m.output ?? '')}` }
  }
  if (type === 'message' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'developer')) {
    const msgRole = m.role === 'developer' ? 'system' : m.role as ChatMessage['role']
    return { role: msgRole, content: normalizeContent(m.content) }
  }
  return null
}

function buildToolOutputItem(item: ToolCallItem, itemId: string): Record<string, unknown> {
  if (item.type === 'function_call') {
    return {
      id: itemId,
      type: 'function_call',
      call_id: item.callId,
      name: item.name,
      arguments: item.arguments,
      status: 'completed',
    }
  } else {
    const action: Record<string, unknown> = {
      type: 'exec',
      command: item.command,
      timeout_ms: 30000,
    }
    if (item.workingDirectory !== null) {
      action.working_directory = item.workingDirectory
    }
    return {
      id: itemId,
      type: 'local_shell_call',
      call_id: item.callId,
      action,
      status: 'completed',
    }
  }
}

export async function handleResponsesNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
  console.log('[responses] POST /v1/responses method=' + req.method)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  const raw = await new Promise<string>((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

  const body = JSON.parse(raw) as {
    model?: string
    input: string | Array<Record<string, unknown>>
    stream?: boolean
  }

  const { model = 'human', input, stream = false } = body
  const tools = (body as Record<string, unknown>).tools as Array<Record<string, unknown>> | undefined
  const instructions = (body as Record<string, unknown>).instructions as string | undefined
  console.log(`[responses] model=${model} stream=${stream} tools=${tools?.map((t) => t.name ?? (t.function as Record<string, unknown>)?.name).join(',') ?? 'none'}`)

  const inputMessages: ChatMessage[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input.flatMap((m) => { const msg = normalizeInputItem(m); return msg ? [msg] : [] })

  // instructions はシステムプロンプト。input 内に同等の system/developer メッセージがなければ先頭に追加する。
  const hasSystemMessage = inputMessages.some((m) => m.role === 'system')
  const messages: ChatMessage[] = instructions && !hasSystemMessage
    ? [{ role: 'system', content: instructions }, ...inputMessages]
    : inputMessages

  const requestId = crypto.randomUUID()
  const respId = `resp_${requestId}`
  const msgId = `msg_${requestId}`
  const createdAt = Math.floor(Date.now() / 1000)

  if (!stream) {
    type CompletionResult = { kind: 'text'; text: string } | { kind: 'tool'; item: ToolCallItem }
    const result = await new Promise<CompletionResult>((resolve, reject) => {
      addPending(
        requestId, messages, () => {},
        (text) => resolve({ kind: 'text', text }),
        reject,
        (item) => resolve({ kind: 'tool', item }),
      )
      broadcast({ type: 'request', requestId, messages, model, createdAt })
      setTimeout(() => {
        const rejected = rejectPending(requestId, new Error('timeout'))
        if (rejected) broadcast({ type: 'timeout', requestId })
      }, TIMEOUT_MS)
    })

    let output: Record<string, unknown>[]
    if (result.kind === 'text') {
      output = [{
        type: 'message', id: msgId, role: 'assistant',
        content: [{ type: 'output_text', text: result.text, annotations: [] }],
        status: 'completed',
      }]
    } else {
      const itemId = result.item.type === 'function_call' ? `fc_${requestId}` : `lsc_${requestId}`
      output = [buildToolOutputItem(result.item, itemId)]
    }

    const responseBody = JSON.stringify({
      id: respId, object: 'response', created_at: createdAt, model,
      status: 'completed',
      output,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    })

    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS })
    res.end(responseBody)
    return
  }

  // SSE streaming
  const socket = req.socket
  if (!socket) { res.writeHead(500); res.end(); return }

  socket.setNoDelay(true)

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

  // message 用の output_item.added/content_part.added はレスポンス種別が確定してから送信する
  let messageEventsStarted = false
  const ensureMessageEventsStarted = () => {
    if (messageEventsStarted) return
    messageEventsStarted = true
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
  }

  addPending(
    requestId,
    messages,
    (deltaText) => {
      ensureMessageEventsStarted()
      writeSSE('response.output_text.delta', {
        type: 'response.output_text.delta',
        item_id: msgId, output_index: 0, content_index: 0,
        delta: deltaText,
      })
    },
    (fullText) => {
      ensureMessageEventsStarted()
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
    (item) => {
      console.log(`[responses] completeTool fired type=${item.type} writable=${socket.writable}`)
      const itemId = item.type === 'function_call' ? `fc_${requestId}` : `lsc_${requestId}`
      const completedItem = buildToolOutputItem(item, itemId)
      console.log('[responses] completedItem:', JSON.stringify(completedItem))
      const inProgressItem = { ...completedItem, status: 'in_progress' }

      writeSSE('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: inProgressItem,
      })

      // function_call の場合は SDK が要求する引数 delta/done イベントを送信する
      if (item.type === 'function_call') {
        writeSSE('response.function_call_arguments.delta', {
          type: 'response.function_call_arguments.delta',
          item_id: itemId,
          output_index: 0,
          delta: item.arguments,
        })
        writeSSE('response.function_call_arguments.done', {
          type: 'response.function_call_arguments.done',
          item_id: itemId,
          output_index: 0,
          arguments: item.arguments,
        })
      }

      writeSSE('response.output_item.done', {
        type: 'response.output_item.done',
        output_index: 0,
        item: completedItem,
      })
      writeSSE('response.completed', {
        type: 'response.completed',
        response: {
          id: respId, object: 'response', created_at: createdAt,
          status: 'completed', model,
          output: [completedItem],
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        },
      })
      socket.end()
    },
  )

  broadcast({ type: 'request', requestId, messages, model, createdAt })

  setTimeout(() => {
    const rejected = rejectPending(requestId, new Error('timeout'))
    if (rejected) broadcast({ type: 'timeout', requestId })
  }, TIMEOUT_MS)
}

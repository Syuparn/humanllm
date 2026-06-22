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
    addPending(requestId, messages, () => {}, resolve, reject)

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

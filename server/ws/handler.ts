import type { WebSocket } from 'ws'
import type { WsResponseMessage } from '../../shared/types'
import { addClient, removeClient } from './clients'
import { resolvePending, deltaPending } from '../store/pendingRequests'

export function handleWebSocket(ws: WebSocket): void {
  addClient(ws)

  ws.on('message', (raw) => {
    try {
      const msg: WsResponseMessage = JSON.parse(raw.toString())
      if (msg.type === 'response') {
        const ok = resolvePending(msg.requestId, msg.content)
        if (!ok) {
          console.warn(`[ws] no pending request for id=${msg.requestId}`)
        }
      } else if (msg.type === 'delta') {
        const ok = deltaPending(msg.requestId, msg.content)
        if (!ok) {
          console.warn(`[ws] no pending request for delta id=${msg.requestId}`)
        }
      }
    } catch (e) {
      console.error('[ws] failed to parse message:', e)
    }
  })

  ws.on('close', () => {
    removeClient(ws)
  })

  ws.on('error', (err) => {
    console.error('[ws] error:', err)
    removeClient(ws)
  })
}

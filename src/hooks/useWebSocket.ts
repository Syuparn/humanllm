import { useEffect, useRef, useState, useCallback } from 'react'
import type { WsServerMessage, WsResponseMessage } from '../../shared/types'

type WsStatus = 'connecting' | 'open' | 'closed'

export function useWebSocket(onMessage: (msg: WsServerMessage) => void) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const [retryCount, setRetryCount] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let intentionallyClosed = false
    setStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.addEventListener('open', () => setStatus('open'))
    ws.addEventListener('close', () => {
      setStatus('closed')
      // クリーンアップによる意図的なクローズは再接続しない
      if (!intentionallyClosed) {
        setTimeout(() => setRetryCount((c) => c + 1), 3000)
      }
    })
    ws.addEventListener('error', () => setStatus('closed'))
    ws.addEventListener('message', (event) => {
      try {
        const msg: WsServerMessage = JSON.parse(event.data)
        onMessageRef.current(msg)
      } catch (e) {
        console.error('[ws] parse error', e)
      }
    })

    return () => {
      intentionallyClosed = true
      ws.close()
    }
  }, [retryCount])

  const send = useCallback((msg: WsResponseMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { status, send }
}

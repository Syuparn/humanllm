import { useState, useCallback } from 'react'
import type { WsServerMessage } from '../shared/types'
import { useWebSocket } from './hooks/useWebSocket'
import { RequestQueue } from './components/RequestQueue'
import { HistoryList } from './components/HistoryList'
import { PromptDisplay } from './components/PromptDisplay'
import { ResponseInput } from './components/ResponseInput'
import './App.css'

export type RequestItem = {
  requestId: string
  messages: import('../shared/types').ChatMessage[]
  model: string
  createdAt: number
}

export type HistoryItem = RequestItem & {
  response: string
  completedAt: number
}

function App() {
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const handleMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'request') {
      setRequests((prev) => {
        const next = [...prev, msg]
        if (prev.length === 0) {
          setSelectedId(msg.requestId)
        }
        return next
      })
    } else if (msg.type === 'timeout') {
      setRequests((prev) => {
        const next = prev.filter((r) => r.requestId !== msg.requestId)
        setSelectedId((id) => {
          if (id === msg.requestId) {
            return next[0]?.requestId ?? null
          }
          return id
        })
        return next
      })
    }
  }, [])

  const { status, send } = useWebSocket(handleMessage)

  const selectedRequest = requests.find((r) => r.requestId === selectedId) ?? null
  const selectedHistory = history.find((h) => h.requestId === selectedHistoryId) ?? null

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedHistoryId(null)
    setResponseText('')
  }, [])

  const handleSelectHistory = useCallback((id: string) => {
    setSelectedHistoryId(id)
    setSelectedId(null)
    setResponseText('')
  }, [])

  const handleDelta = useCallback(() => {
    if (!selectedId || !responseText.trim()) return
    send({ type: 'delta', requestId: selectedId, content: responseText.trim() + '\n' })
    setResponseText('')
  }, [selectedId, responseText, send])

  const handleSubmit = useCallback(() => {
    if (!selectedId || !responseText.trim()) return

    const content = responseText.trim()
    send({ type: 'response', requestId: selectedId, content })

    setRequests((prev) => {
      const completed = prev.find((r) => r.requestId === selectedId)
      if (completed) {
        setHistory((h) => [
          { ...completed, response: content, completedAt: Math.floor(Date.now() / 1000) },
          ...h,
        ])
        setSelectedHistoryId(completed.requestId)
      }
      const next = prev.filter((r) => r.requestId !== selectedId)
      setSelectedId(next[0]?.requestId ?? null)
      return next
    })
    setResponseText('')
  }, [selectedId, responseText, send])

  const statusLabel = {
    connecting: { text: '再接続中…', cls: 'status-connecting' },
    open: { text: '接続中', cls: 'status-open' },
    closed: { text: '切断', cls: 'status-closed' },
  }[status]

  return (
    <div className="layout">
      <header className="header">
        <h1 className="header-title">humanllm</h1>
        <span className={`header-status ${statusLabel.cls}`}>{statusLabel.text}</span>
      </header>

      <div className="main">
        <aside className="sidebar">
          <RequestQueue
            requests={requests}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
          <HistoryList
            history={history}
            selectedId={selectedHistoryId}
            onSelect={handleSelectHistory}
          />
        </aside>

        <section className="content">
          {selectedRequest ? (
            <>
              <PromptDisplay messages={selectedRequest.messages} />
              <ResponseInput
                value={responseText}
                onChange={setResponseText}
                onSubmit={handleSubmit}
                onDelta={handleDelta}
                disabled={false}
              />
            </>
          ) : selectedHistory ? (
            <PromptDisplay
              messages={[
                ...selectedHistory.messages,
                { role: 'assistant', content: selectedHistory.response },
              ]}
            />
          ) : (
            <div className="content-empty">
              <p>API リクエストの到着を待っています…</p>
              <code>POST /v1/chat/completions</code>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App

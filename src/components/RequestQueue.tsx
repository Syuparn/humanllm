import type { RequestItem } from '../App'

type Props = {
  requests: RequestItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function RequestQueue({ requests, selectedId, onSelect }: Props) {
  if (requests.length === 0) {
    return (
      <div className="queue empty">
        <span className="queue-empty-icon">⏳</span>
        <p>No pending requests</p>
      </div>
    )
  }

  return (
    <div className="queue">
      <div className="queue-header">
        Pending requests <span className="queue-badge">{requests.length}</span>
      </div>
      <ul className="queue-list">
        {requests.map((req) => {
          const lastUserMsg = [...req.messages]
            .reverse()
            .find((m) => m.role === 'user')
          const elapsed = Math.floor((Date.now() - req.createdAt * 1000) / 1000)

          return (
            <li
              key={req.requestId}
              className={`queue-item ${req.requestId === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(req.requestId)}
            >
              <div className="queue-item-preview">
                {lastUserMsg?.content.slice(0, 60) ?? '(no message)'}
                {(lastUserMsg?.content.length ?? 0) > 60 ? '…' : ''}
              </div>
              <div className="queue-item-meta">{elapsed}s ago</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

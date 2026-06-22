import type { HistoryItem } from '../App'

type Props = {
  history: HistoryItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function HistoryList({ history, selectedId, onSelect }: Props) {
  if (history.length === 0) return null

  return (
    <div className="history">
      <div className="queue-header">履歴</div>
      <ul className="queue-list">
        {history.map((item) => {
          const lastUserMsg = [...item.messages].reverse().find((m) => m.role === 'user')
          return (
            <li
              key={item.requestId}
              className={`queue-item history-item ${item.requestId === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(item.requestId)}
            >
              <div className="queue-item-preview">
                {lastUserMsg?.content.slice(0, 60) ?? '(メッセージなし)'}
                {(lastUserMsg?.content.length ?? 0) > 60 ? '…' : ''}
              </div>
              <div className="queue-item-meta">✓ 返信済み</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

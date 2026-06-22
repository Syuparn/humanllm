import { useRef, useEffect } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
}

export function ResponseInput({ value, onChange, onSubmit, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus()
    }
  }, [disabled])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  return (
    <div className="response-input">
      <div className="response-input-label">あなたの回答</div>
      <textarea
        ref={textareaRef}
        className="response-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'リクエストを選択してください…' : '回答を入力してください…'}
        disabled={disabled}
        rows={6}
      />
      <div className="response-actions">
        <span className="response-hint">Ctrl+Enter で送信</span>
        <button
          className="response-submit"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          送信
        </button>
      </div>
    </div>
  )
}

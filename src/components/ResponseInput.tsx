import { useRef, useEffect } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onDelta: () => void
  disabled: boolean
}

export function ResponseInput({ value, onChange, onSubmit, onDelta, disabled }: Props) {
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
      <div className="response-input-label">Your response</div>
      <textarea
        ref={textareaRef}
        className="response-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Select a request…' : 'Type your response…'}
        disabled={disabled}
        rows={6}
      />
      <div className="response-actions">
        <span className="response-hint">Ctrl+Enter to send</span>
        <button
          className="response-delta"
          onClick={onDelta}
          disabled={disabled || !value.trim()}
        >
          Send progress
        </button>
        <button
          className="response-submit"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

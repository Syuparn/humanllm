import { useState, useRef, useEffect } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onDelta: () => void
  onFunctionCall: (name: string, args: string) => void
  onLocalShellCall: (command: string[], workingDirectory: string | null) => void
  disabled: boolean
}

export function ResponseInput({ value, onChange, onSubmit, onDelta, onFunctionCall, onLocalShellCall, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [toolMode, setToolMode] = useState<'function_call' | 'local_shell_call' | null>(null)
  const [fnName, setFnName] = useState('')
  const [fnArgs, setFnArgs] = useState('{}')
  const [shellCmd, setShellCmd] = useState('')
  const [shellDir, setShellDir] = useState('')

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

  const handleToggleTool = (mode: 'function_call' | 'local_shell_call') => {
    setToolMode((prev) => (prev === mode ? null : mode))
  }

  const handleSendFunctionCall = () => {
    if (!fnName.trim()) return
    onFunctionCall(fnName.trim(), fnArgs.trim() || '{}')
    setFnName('')
    setFnArgs('{}')
    setToolMode(null)
  }

  const handleSendShellCall = () => {
    if (!shellCmd.trim()) return
    const command = ['sh', '-c', shellCmd.trim()]
    const workingDirectory = shellDir.trim() || null
    onLocalShellCall(command, workingDirectory)
    setShellCmd('')
    setShellDir('')
    setToolMode(null)
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

      {toolMode === 'function_call' && !disabled && (
        <div className="tool-form">
          <div className="tool-form-title">function_call</div>
          <div className="tool-form-row">
            <label className="tool-form-label">name</label>
            <input
              className="tool-form-input"
              type="text"
              placeholder="write_file"
              value={fnName}
              onChange={(e) => setFnName(e.target.value)}
            />
          </div>
          <div className="tool-form-row">
            <label className="tool-form-label">arguments</label>
            <textarea
              className="tool-form-textarea"
              placeholder='{"path": "foo.txt", "content": "hello"}'
              value={fnArgs}
              onChange={(e) => setFnArgs(e.target.value)}
              rows={3}
            />
          </div>
          <div className="tool-form-actions">
            <button className="tool-form-cancel" onClick={() => setToolMode(null)}>Cancel</button>
            <button className="tool-form-send fn-send" onClick={handleSendFunctionCall} disabled={!fnName.trim()}>
              Send function_call
            </button>
          </div>
        </div>
      )}

      {toolMode === 'local_shell_call' && !disabled && (
        <div className="tool-form">
          <div className="tool-form-title">local_shell_call</div>
          <div className="tool-form-row">
            <label className="tool-form-label">command</label>
            <input
              className="tool-form-input"
              type="text"
              placeholder="echo hello > foo.txt  (シェル構文が使えますわ)"
              value={shellCmd}
              onChange={(e) => setShellCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendShellCall() }}
            />
          </div>
          <div className="tool-form-row">
            <label className="tool-form-label">working_dir</label>
            <input
              className="tool-form-input"
              type="text"
              placeholder="/home/user  (optional)"
              value={shellDir}
              onChange={(e) => setShellDir(e.target.value)}
            />
          </div>
          <div className="tool-form-actions">
            <button className="tool-form-cancel" onClick={() => setToolMode(null)}>Cancel</button>
            <button className="tool-form-send sh-send" onClick={handleSendShellCall} disabled={!shellCmd.trim()}>
              Send local_shell_call
            </button>
          </div>
        </div>
      )}

      <div className="response-actions">
        <span className="response-hint">Ctrl+Enter to send</span>
        <button
          className={`btn-tool-call btn-shell${toolMode === 'local_shell_call' ? ' active' : ''}`}
          onClick={() => handleToggleTool('local_shell_call')}
          disabled={disabled}
          title="Send as local_shell_call"
        >
          local_shell_call
        </button>
        <button
          className={`btn-tool-call btn-fn${toolMode === 'function_call' ? ' active' : ''}`}
          onClick={() => handleToggleTool('function_call')}
          disabled={disabled}
          title="Send as function_call"
        >
          function_call
        </button>
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

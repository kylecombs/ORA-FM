import { extractPatchJson } from '../hooks/useDaphne';
import './DaphnePanel.css';

// ── Render markdown-ish content ─────────────────────────
function renderMessage(text) {
  const parts = [];
  let lastIdx = 0;
  const codeBlockRegex = /```(\w*)\s*\n?([\s\S]*?)```/g;
  let m;
  while ((m = codeBlockRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: 'text', content: text.slice(lastIdx, m.index) });
    }
    parts.push({ type: 'code', lang: m[1], content: m[2].trimEnd() });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIdx) });
  }

  return parts.map((part, i) => {
    if (part.type === 'code') {
      return (
        <pre key={i} className="ai-code-block" data-lang={part.lang}>
          <code>{part.content}</code>
        </pre>
      );
    }
    const lines = part.content.split('\n');
    return (
      <span key={i}>
        {lines.map((line, j) => {
          let formatted = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
          formatted = formatted.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
          return (
            <span key={j}>
              {j > 0 && <br />}
              <span dangerouslySetInnerHTML={{ __html: formatted }} />
            </span>
          );
        })}
      </span>
    );
  });
}

export default function DaphnePanel({
  isOpen,
  onClose,
  messages,
  input,
  setInput,
  loading,
  error,
  messagesEndRef,
  inputRef,
  sendMessage,
  handleKeyDown,
  handleLoadPatch,
  clearChat,
}) {
  return (
    <div className={`ai-prompt-panel${isOpen ? ' open' : ''}`}>
      <div className="ai-panel-header">
        <div className="ai-panel-title-row">
          <span className="ai-panel-icon">~</span>
          <span className="ai-panel-title">Daphne</span>
        </div>
        <div className="ai-panel-actions">
          <button className="ai-panel-clear" onClick={clearChat}>
            clear
          </button>
          <button className="ai-panel-close" onClick={onClose}>
            &times;
          </button>
        </div>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && !loading && (
          <div className="ai-empty">
            <div className="ai-empty-title">Ask Daphne</div>
            <div className="ai-empty-hints">
              <button
                className="ai-hint-btn"
                onClick={() =>
                  setInput('What is FM synthesis and how do I build it in ORA?')
                }
              >
                What is FM synthesis?
              </button>
              <button
                className="ai-hint-btn"
                onClick={() =>
                  setInput(
                    'Create a patch with a sine oscillator through a reverb and low-pass filter'
                  )
                }
              >
                Simple reverb patch
              </button>
              <button
                className="ai-hint-btn"
                onClick={() =>
                  setInput(
                    'Create a generative ambient patch using scripts and envelopes'
                  )
                }
              >
                Generative ambient patch
              </button>
              <button
                className="ai-hint-btn"
                onClick={() =>
                  setInput('How do I connect a script module to modulate frequency?')
                }
              >
                Script modulation
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ai-message-${msg.role}`}>
            <div className="ai-message-label">
              {msg.role === 'user' ? 'you' : 'daphne'}
            </div>
            <div className="ai-message-content">
              {renderMessage(msg.content)}
            </div>
            {msg.role === 'assistant' && extractPatchJson(msg.content) && (
              <button
                className="ai-load-patch-btn"
                onClick={() => handleLoadPatch(msg.content)}
              >
                Load Patch into Grid
              </button>
            )}
          </div>
        ))}

        {loading && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-message-label">daphne</div>
            <div className="ai-message-content ai-typing">
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span className="ai-dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="ai-error">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about synthesis, or request a patch…"
          rows={1}
          disabled={loading}
        />
        <button
          className="ai-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
        >
          {loading ? '…' : '->'}
        </button>
      </div>
    </div>
  );
}

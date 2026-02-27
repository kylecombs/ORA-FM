export default function PrintConsole({
  consoleOpen,
  setConsoleOpen,
  printLogs,
  clearPrintLogs,
  printConsoleRef,
}) {
  return (
    <div className={`print-console-panel${consoleOpen ? ' open' : ''}`}>
      <div className="print-console-header">
        <span className="print-console-title">Console</span>
        <div className="print-console-actions">
          <button
            className="print-console-clear"
            onClick={clearPrintLogs}
          >
            clear
          </button>
          <button
            className="print-console-close"
            onClick={() => setConsoleOpen(false)}
          >
            &times;
          </button>
        </div>
      </div>
      <div className="print-console-output" ref={printConsoleRef}>
        {printLogs.map((entry) => (
          <div key={entry.id} className="print-console-line">
            <span className="print-console-time">{entry.time}</span>
            <span
              className="print-console-prefix"
              style={{ color: entry.color }}
            >
              [{entry.prefix}]
            </span>
            <span className="print-console-value">{entry.value}</span>
          </div>
        ))}
        {printLogs.length === 0 && (
          <div className="print-console-empty">
            Add a Print module and connect a signal to see values here
          </div>
        )}
      </div>
    </div>
  );
}

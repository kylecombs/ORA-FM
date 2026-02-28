import './GridLayout.css';

export default function GridLayout({
  toolbar,
  sidebar,
  canvas,
  details,
  console: consolePan,
  sidebarOpen = false,
  detailsOpen = false,
  consoleOpen = false,
}) {
  return (
    <div className="ora-grid-layout">
      <div className="ora-grid-layout__toolbar">{toolbar}</div>

      <div className="ora-grid-layout__body">
        {sidebarOpen && (
          <div className="ora-grid-layout__sidebar">{sidebar}</div>
        )}

        <div className="ora-grid-layout__canvas">{canvas}</div>

        {detailsOpen && (
          <div className="ora-grid-layout__details">{details}</div>
        )}
      </div>

      {consoleOpen && (
        <div className="ora-grid-layout__console">{consolePan}</div>
      )}
    </div>
  );
}

export default function LiveATC() {
  const feeds = [
    {
      label: "TWR 1",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk_twr&icao=kjfk",
    },
    {
      label: "TWR 2",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk_twr3&icao=kjfk",
    },
    {
      label: "NY APP CAMRN #1",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk9_app_camrn&icao=kjfk",
    },
    {
      label: "NY APP FINAL #1",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk_bw_app_final&icao=kjfk",
    },
    {
      label: "NY APP ROBER #1",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk9_app_rober&icao=kjfk",
    },
    {
      label: "NY DEP",
      url: "https://www.liveatc.net/hlisten.php?mount=kjfk_dep&icao=kjfk",
    },
  ];

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 9999,
        width: 260,
        fontFamily: "monospace",
        fontSize: 12,
        color: "#00ff00",
        textShadow: "0 0 3px rgba(0,255,0,0.6)",
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(0,255,0,0.25)",
        padding: "10px",
        pointerEvents: "auto",
      }}
    >
      <div style={{ marginBottom: 8 }}>LIVEATC (opens new tab)</div>

      <div style={{ display: "grid", gap: 6 }}>
        {feeds.map((feed) => (
          <a
            key={feed.url}
            href={feed.url}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#00ff00",
              textDecoration: "none",
              border: "1px solid rgba(0,255,0,0.18)",
              padding: "6px 8px",
              background: "rgba(0,0,0,0.25)",
              display: "block",
            }}
          >
            {feed.label}
          </a>
        ))}
      </div>
    </div>
  );
}

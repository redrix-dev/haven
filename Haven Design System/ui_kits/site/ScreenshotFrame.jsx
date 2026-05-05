function ScreenshotFrame({ label, src, alt }) {
  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid #304867",
      background: "#16233a",
      overflow: "hidden",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid #304867",
        background: "#121d31",
      }}>
        <div style={{ width: 12, height: 12, borderRadius: 999, background: "#b74a56" }} />
        <div style={{ width: 12, height: 12, borderRadius: 999, background: "#c1964a" }} />
        <div style={{ width: 12, height: 12, borderRadius: 999, background: "#6bb48b" }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: "#a9b8cf" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1728", padding: 12 }}>
        <img src={src} alt={alt} style={{ width: "100%", maxWidth: 1200, height: "auto", borderRadius: 6, border: "1px solid rgba(48,72,103,0.7)" }} />
      </div>
    </div>
  );
}
window.ScreenshotFrame = ScreenshotFrame;

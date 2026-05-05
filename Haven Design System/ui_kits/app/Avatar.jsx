function Avatar({ name, color = "linear-gradient(135deg,#325fae,#59b7ff)", size = 32, status }) {
  const initials = name.split(/\s|\./).map(s => s[0]).slice(0,2).join("").toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: 999, background: color, color: "#fff", fontWeight: 700, fontSize: size * 0.38, display: "grid", placeItems: "center" }}>{initials}</div>
      {status && <span style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: 999, background: status, boxShadow: "0 0 0 2px #1c2a43" }} />}
    </div>
  );
}
window.Avatar = Avatar;

function Header() {
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px",
      borderBottom: "1px solid rgba(48, 72, 103, 0.4)",
      background: "rgba(15, 23, 40, 0.8)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }}>
      <a href="#" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <img src="../../assets/haven-owl-512.png" alt="Haven" style={{ width: 28, height: 28, borderRadius: "22%" }} />
        <span style={{ fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>Haven</span>
        <window.Badge variant="outline" className="" >by REDRIXX</window.Badge>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#a9b8cf", fontSize: 14, textDecoration: "none" }}>
          <img src="../../assets/github-mark.svg" alt="GitHub" style={{ width: 16, height: 16 }} />
          GitHub
        </a>
        <window.Button variant="primary" size="md">
          <window.Icon.Download />
          Download
        </window.Button>
      </div>
    </nav>
  );
}
window.Header = Header;

function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid rgba(48, 72, 103, 0.4)",
      padding: "32px 24px",
      maxWidth: 1024, margin: "0 auto", width: "100%",
      display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      gap: 16, fontSize: 14, color: "#a9b8cf",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src="../../assets/haven-owl-512.png" alt="" style={{ width: 20, height: 20, borderRadius: "22%" }} />
        <span>Haven by REDRIXX</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <a href="#" className="footer-link">Terms</a>
        <a href="#" className="footer-link">Privacy</a>
        <a href="#" className="footer-link">GitHub</a>
        <a href="#" className="footer-link">redrixx.com</a>
      </div>
    </footer>
  );
}
window.Footer = Footer;

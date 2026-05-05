function CTACard() {
  const I = window.Icon;
  return (
    <div style={{
      borderRadius: 16, border: "1px solid #304867", background: "#16233a",
      padding: 40, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center",
    }}>
      <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Bring your community.</h2>
      <p style={{ margin: 0, color: "#a9b8cf", lineHeight: 1.7, fontSize: 16 }}>
        Haven is free to use right now. Download it, spin up a server, and help us build something worth sticking around for.
      </p>
      <p style={{ margin: 0, fontSize: 14, color: "rgba(169, 184, 207, 0.7)" }}>
        Windows only for now. More platforms on the way.
      </p>
      <div style={{ paddingTop: 8 }}>
        <window.Button size="lg" variant="primary" style={{ paddingLeft: 40, paddingRight: 40 }}>
          <I.Download />
          Download Haven
        </window.Button>
      </div>
    </div>
  );
}
window.CTACard = CTACard;

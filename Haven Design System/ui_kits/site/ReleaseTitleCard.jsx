function ReleaseTitleCard({ badgeLabel, eyebrow, title, accent, subtitle, features, footer, actions }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      borderRadius: 28,
      border: "1px solid #304867",
      background: "linear-gradient(180deg, #0f1728 0%, #121d31 100%)",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
    }}>
      {/* radial top glow */}
      <div style={{
        pointerEvents: "none", position: "absolute", top: -96, left: "50%",
        transform: "translateX(-50%)", height: 380, width: 680, borderRadius: 999,
        background: "radial-gradient(circle, rgba(63,121,216,0.22) 0%, transparent 65%)",
      }} />
      {/* lower-right blob */}
      <div style={{
        pointerEvents: "none", position: "absolute", bottom: -112, right: -80,
        height: 360, width: 360, borderRadius: 999,
        background: "rgba(63, 121, 216, 0.14)", filter: "blur(28px)",
      }} />

      <div style={{
        position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between",
        gap: 40, padding: 44,
      }}>
        {/* Top row: brand + badge */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="../../assets/haven-owl-512.png" alt="" style={{ width: 40, height: 40, borderRadius: "22%" }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Haven</div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7f90ac" }}>by REDRIXX</div>
            </div>
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            border: "1px solid rgba(63, 121, 216, 0.5)",
            background: "rgba(63, 121, 216, 0.15)",
            color: "#5f8fdd",
            borderRadius: 999, padding: "8px 16px", fontSize: 14, fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#3f79d8", display: "inline-block" }} />
            {badgeLabel}
          </div>
        </div>

        {/* Eyebrow + Title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "#7f90ac" }}>
            <span style={{ height: 1, width: 24, background: "#3f79d8", display: "inline-block" }} />
            {eyebrow}
          </div>

          <h1 style={{
            margin: 0, maxWidth: 880, fontSize: 68, fontWeight: 800, lineHeight: 1,
            letterSpacing: "-0.05em", color: "#fff",
          }}>
            {title}
            <br />
            <span style={{ color: "#3f79d8" }}>{accent}</span>
          </h1>

          <p style={{ margin: 0, maxWidth: 640, fontSize: 19, lineHeight: 1.6, color: "#a9b8cf" }}>
            {subtitle}
          </p>
        </div>

        {/* Footer row */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {features.map((f) => (
                <div key={f} style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  borderRadius: 999, padding: "6px 12px",
                  border: "1px solid rgba(48, 72, 103, 0.9)",
                  background: "rgba(22, 35, 58, 0.95)",
                  fontSize: 14, color: "#e6edf7",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "#6bb48b", display: "inline-block" }} />
                  {f}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 14, color: "#7f90ac" }}>{footer}</div>
          </div>

          {actions ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
window.ReleaseTitleCard = ReleaseTitleCard;

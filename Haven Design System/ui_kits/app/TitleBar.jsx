function HavenOwlInline({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.25C4.4 1.25 1.75 4.15 1.75 7.55C1.75 11.5 4.55 14.75 8 14.75C11.45 14.75 14.25 11.5 14.25 7.55C14.25 4.15 11.6 1.25 8 1.25Z" fill="#3F79D8" />
      <path d="M4.2 4.7L6 3.2L7.1 5.15H8.9L10 3.2L11.8 4.7V8.35C11.8 10.5 10.15 12.25 8 12.25C5.85 12.25 4.2 10.5 4.2 8.35V4.7Z" fill="#EAF1FF" />
      <circle cx="6.3" cy="7.2" r="1.1" fill="#0D1626" />
      <circle cx="9.7" cy="7.2" r="1.1" fill="#0D1626" />
      <path d="M8 8.5L6.95 9.55H9.05L8 8.5Z" fill="#D08D3F" />
    </svg>
  );
}

function TitleBar() {
  const I = window.Icon;
  const ctrlBtn = {
    height: 32, width: 40, display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "#9fb2d1", background: "transparent", border: 0, cursor: "pointer",
    transition: "background .15s, color .15s",
  };
  return (
    <div style={{
      position: "fixed", insetInline: 0, top: 0, zIndex: 50,
      height: 32, display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: "1px solid #1a2a3f",
      background: "rgba(13, 22, 38, 0.95)",
      backdropFilter: "blur(4px)",
      WebkitAppRegion: "drag",
      paddingLeft: 12,
      color: "#d7e0ef",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>
        <HavenOwlInline />
        <span>Haven</span>
      </div>
      <div style={{ display: "flex", alignItems: "stretch", WebkitAppRegion: "no-drag" }}>
        <button style={ctrlBtn} onMouseEnter={e=>{e.currentTarget.style.background="#1a2a3f";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9fb2d1";}}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
        <button style={ctrlBtn} onMouseEnter={e=>{e.currentTarget.style.background="#1a2a3f";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9fb2d1";}}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1.5" y="1.5" width="7" height="7" rx="0.6" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
        <button style={ctrlBtn} onMouseEnter={e=>{e.currentTarget.style.background="#c34747";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9fb2d1";}}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
window.TitleBar = TitleBar;
window.HavenOwlInline = HavenOwlInline;

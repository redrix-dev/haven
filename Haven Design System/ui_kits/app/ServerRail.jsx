function ServerTile({ active, label, color, onClick, mascot }) {
  const tileStyle = {
    width: 48, height: 48, borderRadius: 16,
    display: "grid", placeItems: "center",
    fontWeight: 700, fontSize: 16, color: "#fff",
    background: active ? "#3f79d8" : (color || "#18243a"),
    border: "1px solid #2c4061",
    cursor: "pointer",
    transition: "background .15s, border-radius .15s",
    overflow: "hidden",
  };
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      {active && <span style={{ position: "absolute", left: -12, top: 8, width: 4, height: 32, borderRadius: 999, background: "#fff" }} />}
      <button onClick={onClick}
        onMouseEnter={(e) => !active && (e.currentTarget.style.background = "#3f79d8")}
        onMouseLeave={(e) => !active && (e.currentTarget.style.background = color || "#18243a")}
        style={tileStyle}>
        {mascot ? <img src="../../assets/haven-owl-512.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} /> : label}
      </button>
    </div>
  );
}

function ServerRail({ activeId, onSelect }) {
  const I = window.Icon;
  const servers = [
    { id: "haven", label: "H", mascot: true },
    { id: "design", label: "DS", color: "#1d2a42" },
    { id: "music", label: "Mu", color: "#2a1d3f" },
    { id: "gamedev", label: "GD", color: "#1d3f2a" },
  ];
  return (
    <aside style={{
      width: 72, flexShrink: 0,
      background: "#142033",
      borderRight: "1px solid #1a2a3f",
      padding: "12px 0",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      overflowY: "auto",
    }}>
      {servers.map(s => (
        <ServerTile key={s.id} active={activeId === s.id} {...s} onClick={() => onSelect(s.id)} />
      ))}
      <div style={{ width: 32, height: 1, background: "#2c4061", margin: "4px 0" }} />
      <button style={{
        width: 48, height: 48, borderRadius: 16, background: "#18243a",
        border: "1px dashed #2c4061", color: "#6bb48b", display: "grid", placeItems: "center", cursor: "pointer",
      }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(107,180,139,0.15)"}} onMouseLeave={e=>{e.currentTarget.style.background="#18243a"}}>
        <I.Plus />
      </button>
      <button title="Discover" style={{
        width: 48, height: 48, borderRadius: 16, background: "#18243a",
        border: "1px solid #2c4061", color: "#a9b8cf", display: "grid", placeItems: "center", cursor: "pointer",
      }} onMouseEnter={e=>{e.currentTarget.style.background="#1d2a42"; e.currentTarget.style.color="#fff"}} onMouseLeave={e=>{e.currentTarget.style.background="#18243a"; e.currentTarget.style.color="#a9b8cf"}}>
        <I.Search />
      </button>
    </aside>
  );
}
window.ServerRail = ServerRail;

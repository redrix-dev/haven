function MemberList() {
  const groups = [
    { title: "Staff — 2", members: [
      { name: "redrixx", color: "linear-gradient(135deg,#9a5b20,#d08d3f)", status: "#44b894", staff: true },
      { name: "ada.lovelace", color: "linear-gradient(135deg,#325fae,#59b7ff)", status: "#44b894", staff: true },
    ]},
    { title: "Online — 4", members: [
      { name: "jay.kim", color: "linear-gradient(135deg,#2a1d3f,#7e57c2)", status: "#44b894" },
      { name: "moss", color: "linear-gradient(135deg,#1d3f2a,#6bb48b)", status: "#44b894" },
      { name: "you.dev", color: "linear-gradient(135deg,#325fae,#59b7ff)", status: "#44b894" },
      { name: "ren", color: "linear-gradient(135deg,#4a1f2c,#b74a56)", status: "#f0a832" },
    ]},
    { title: "Offline — 2", members: [
      { name: "noor", color: "#22324d", status: null },
      { name: "kai", color: "#22324d", status: null },
    ]},
  ];
  return (
    <aside style={{
      width: 240, flexShrink: 0, background: "#16233a",
      borderLeft: "1px solid #2c4061",
      overflowY: "auto", padding: "12px 8px",
    }}>
      {groups.map(g => (
        <div key={g.title} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7f90ac", padding: "6px 8px" }}>{g.title}</div>
          {g.members.map(m => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 6, cursor: "pointer", opacity: m.status ? 1 : 0.55 }}
              onMouseEnter={e=>{e.currentTarget.style.background="#1d2a42"}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
              <window.Avatar name={m.name} color={m.color} size={28} status={m.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#e6edf7", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  {m.staff && <span style={{ background: "rgba(63,121,216,0.18)", color: "#59b7ff", border: "1px solid rgba(63,121,216,0.3)", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>STAFF</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
window.MemberList = MemberList;

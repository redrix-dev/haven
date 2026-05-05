function ChannelRow({ kind, name, active, unread, onClick, voicePresence }) {
  const I = window.Icon;
  const color = active ? "#fff" : (unread ? "#fff" : "#95a5bf");
  return (
    <div>
      <div onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
        borderRadius: 6, cursor: "pointer", color,
        background: active ? "#22324d" : "transparent",
        fontSize: 14, fontWeight: 500,
      }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = "#1d2a42")}
      onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}>
        <span style={{ width: 18, display: "grid", placeItems: "center", color: active ? "#fff" : "#8ea4c7" }}>
          {kind === "voice" ? <I.Volume width={16} height={16} /> : <I.Hash width={16} height={16} />}
        </span>
        <span style={{ flex: 1 }}>{name}</span>
        {unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999, background: "#d95c5c", color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>{unread}</span>}
      </div>
      {voicePresence && voicePresence.length > 0 && (
        <div style={{ marginLeft: 28, display: "flex", flexDirection: "column", gap: 4, padding: "4px 0 6px" }}>
          {voicePresence.map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#a9b8cf" }}>
              <window.Avatar name={p.name} size={20} />
              <span>{p.name}</span>
              {p.muted && <I.MicOff width={12} height={12} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelGroup({ title, children, defaultOpen = true }) {
  const I = window.Icon;
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: 0, color: "#7f90ac", fontSize: 11, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.12em",
        padding: "8px 8px 4px", display: "flex", alignItems: "center", gap: 4, width: "100%",
        cursor: "pointer",
      }}>
        <span style={{ display: "grid", placeItems: "center", transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .15s" }}>
          <I.ChevronDown width={10} height={10} />
        </span>
        {title}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{children}</div>}
    </div>
  );
}

function UserCard({ name = "you.dev", status = "online" }) {
  const I = window.Icon;
  const dotColor = { online: "#44b894", away: "#f0a832", dnd: "#f04747" }[status];
  return (
    <div style={{
      borderTop: "1px solid #2c4061", padding: "8px 8px",
      background: "#142033", display: "flex", alignItems: "center", gap: 8,
      animation: "havenBreathe 4s ease-in-out infinite",
    }}>
      <window.Avatar name={name} status={dotColor} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 11, color: "#8ea4c7", textTransform: "capitalize" }}>{status === "dnd" ? "Do Not Disturb" : status}</div>
      </div>
      <button style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: 0, color: "#8ea4c7", cursor: "pointer", display: "grid", placeItems: "center" }}
        onMouseEnter={e=>{e.currentTarget.style.background="#22324d";e.currentTarget.style.color="#fff";}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#8ea4c7";}}>
        <I.Mic2 width={14} height={14} />
      </button>
      <button style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: 0, color: "#8ea4c7", cursor: "pointer", display: "grid", placeItems: "center" }}
        onMouseEnter={e=>{e.currentTarget.style.background="#22324d";e.currentTarget.style.color="#fff";}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#8ea4c7";}}>
        <I.Settings width={14} height={14} />
      </button>
    </div>
  );
}

function ChannelSidebar({ channels, activeId, onSelect, communityName = "Haven HQ" }) {
  const I = window.Icon;
  const text = channels.filter(c => c.kind === "text");
  const voice = channels.filter(c => c.kind === "voice");
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: "#1c2a43",
      borderRight: "1px solid #2c4061",
      display: "flex", flexDirection: "column",
      minHeight: 0,
    }}>
      <div style={{
        height: 48, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #2c4061", color: "#fff", fontSize: 14, fontWeight: 600,
      }}>
        <span>{communityName}</span>
        <I.ChevronDown width={14} height={14} color="#a9b8cf" />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        <ChannelGroup title="Text channels">
          {text.map(c => <ChannelRow key={c.id} {...c} active={activeId === c.id} onClick={() => onSelect(c.id)} />)}
        </ChannelGroup>
        <ChannelGroup title="Voice channels">
          {voice.map(c => <ChannelRow key={c.id} {...c} active={activeId === c.id} onClick={() => onSelect(c.id)} />)}
        </ChannelGroup>
      </div>
      <UserCard />
    </aside>
  );
}
window.ChannelSidebar = ChannelSidebar;

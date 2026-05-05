function Message({ msg }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 16px", marginTop: msg.continued ? 0 : 12 }}>
      {msg.continued ? (
        <div style={{ width: 36, fontSize: 11, color: "transparent" }}>{msg.time}</div>
      ) : (
        <window.Avatar name={msg.author} color={msg.color} size={36} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!msg.continued && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{msg.author}</span>
            {msg.staff && <span style={{ background: "rgba(63,121,216,0.18)", color: "#59b7ff", border: "1px solid rgba(63,121,216,0.3)", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.05em" }}>STAFF</span>}
            <span style={{ fontSize: 11, color: "#7f90ac" }}>{msg.time}</span>
          </div>
        )}
        <div style={{ fontSize: 14, color: "#e6edf7", lineHeight: 1.55 }}>{msg.body}</div>
        {msg.reactions && msg.reactions.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {msg.reactions.map((r, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", background: "#1d2a42", border: "1px solid #304867", borderRadius: 999, color: "#e6edf7" }}>
                {r.emoji} <span style={{ color: "#a9b8cf" }}>{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ onSend, channelName }) {
  const I = window.Icon;
  const [val, setVal] = React.useState("");
  const submit = () => { if (val.trim()) { onSend(val.trim()); setVal(""); } };
  return (
    <div style={{ padding: "0 16px 16px", borderTop: "2px solid #111a2b" }}>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 10,
        background: "#142033", border: "1px solid #304867", borderRadius: 14,
        padding: "10px 14px", boxShadow: "0 10px 24px rgba(3,9,20,0.22)",
        marginTop: 12,
      }}>
        <button title="Attach" style={{ background: "transparent", border: 0, color: "#8ea4c7", cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}
          onMouseEnter={e=>{e.currentTarget.style.color="#fff"}} onMouseLeave={e=>{e.currentTarget.style.color="#8ea4c7"}}>
          <I.Paperclip />
        </button>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={`Message #${channelName}`}
          rows={1}
          style={{
            flex: 1, background: "transparent", border: 0, color: "#fff", outline: 0,
            fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, resize: "none", padding: "4px 0",
          }}
        />
        <button title="Emoji" style={{ background: "transparent", border: 0, color: "#8ea4c7", cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}
          onMouseEnter={e=>{e.currentTarget.style.color="#fff"}} onMouseLeave={e=>{e.currentTarget.style.color="#8ea4c7"}}>
          <I.Smile />
        </button>
        <button onClick={submit} title="Send" disabled={!val.trim()} style={{
          background: val.trim() ? "#3f79d8" : "transparent",
          color: val.trim() ? "#fff" : "#8ea4c7",
          border: 0, borderRadius: 8, padding: "6px 8px",
          cursor: val.trim() ? "pointer" : "default",
          display: "grid", placeItems: "center", transition: "background .15s",
        }}>
          <I.Send />
        </button>
      </div>
    </div>
  );
}

function ChatArea({ channel, messages, onSend }) {
  const I = window.Icon;
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [messages.length]);
  const isVoice = channel.kind === "voice";

  return (
    <main style={{
      flex: 1, minWidth: 0, background: "#111a2b",
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      <div style={{
        height: 48, padding: "0 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #263a58",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 600, fontSize: 16 }}>
          {isVoice ? <I.Headphones /> : <span style={{ color: "#8ea4c7" }}>#</span>}
          {channel.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={{ background: "transparent", border: 0, color: "#a9b8cf", padding: "6px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
            onMouseEnter={e=>{e.currentTarget.style.background="#304867"; e.currentTarget.style.color="#fff"}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#a9b8cf"}}>
            Channel Settings
          </button>
        </div>
      </div>

      {isVoice ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <I.Headphones width={28} height={28} color="#8ea4c7" />
          <p style={{ margin: 0, color: "#fff", fontWeight: 600 }}>Voice channel selected: {channel.name}</p>
          <p style={{ margin: 0, color: "#a9b8cf", maxWidth: 480, fontSize: 14, lineHeight: 1.6 }}>
            Voice stays connected while you browse text channels. Use the footer controls for quick actions, or open Voice Settings for devices, transmission tuning, and diagnostics.
          </p>
          <window.Button variant="primary">Open Voice Settings</window.Button>
        </div>
      ) : (
        <>
          <div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "16px 0 8px" }}>
            {messages.map((m, i) => <Message key={i} msg={m} />)}
          </div>
          <Composer onSend={onSend} channelName={channel.name} />
        </>
      )}
    </main>
  );
}
window.ChatArea = ChatArea;
window.Message = Message;
window.Composer = Composer;

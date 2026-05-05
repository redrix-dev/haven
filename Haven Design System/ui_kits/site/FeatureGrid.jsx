function FeatureGrid() {
  const I = window.Icon;
  const items = [
    { icon: I.MessageSquare, title: "Text Channels", description: "Organized channels with real-time messaging, replies, and message management." },
    { icon: I.Mic, title: "Voice Channels", description: "WebRTC-powered voice with listen-only mode, mute, and deafen controls." },
    { icon: I.Shield, title: "Role Permissions", description: "Fine-grained role and channel permissions enforced at the database level, not just the UI." },
    { icon: I.Users, title: "Server Management", description: "Create servers, manage members, and generate invite links with expiry and usage controls." },
    { icon: I.Zap, title: "Real-time", description: "Messages, presence, and voice stay in sync. Built on Supabase Realtime." },
    { icon: I.Lock, title: "Source-Available", description: "The code is public. Read it, audit it, contribute to it. No black boxes." },
  ];
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", textAlign: "center" }}>What Haven does today.</h2>
      <p style={{ margin: "12px 0 48px", textAlign: "center", color: "#a9b8cf", fontSize: 14 }}>No roadmap theater. Here's what's actually shipped.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {items.map(({ icon: IconC, title, description }) => (
          <div key={title} style={{
            borderRadius: 12, border: "1px solid #304867", background: "#16233a", padding: 20,
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "#1d2a42", border: "1px solid #304867",
              display: "grid", placeItems: "center", color: "#3f79d8",
            }}>
              <IconC width={16} height={16} />
            </div>
            <p style={{ margin: 0, fontWeight: 600, color: "#fff" }}>{title}</p>
            <p style={{ margin: 0, fontSize: 14, color: "#a9b8cf", lineHeight: 1.6 }}>{description}</p>
          </div>
        ))}
      </div>
    </>
  );
}
window.FeatureGrid = FeatureGrid;

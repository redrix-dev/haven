/* CommunityScreen — chat (apps/mobile/src/screens/CommunityScreenTestTwo.tsx).
   - CommunityChannelBar at top (server name + selected channel)
   - inverted FlatList of messages (CommunityMessageBubble) with date dividers
   - bottom composer: + button, rounded input, send button */

const HM = window.HM;

const SEED_MESSAGES = [
  { day: "Today",
    items: [
      { id: "m1", author: "redrixx", initial: "R", color: "linear-gradient(135deg,#9a5b20,#d08d3f)", staff: true,
        time: "09:14", body: "Haven 1.7.1 is shipping later today. Moderation infra, routed reports, avatar uploads, markdown tools." },
      { id: "m2", author: "redrixx", initial: "R", color: "linear-gradient(135deg,#9a5b20,#d08d3f)", staff: true,
        time: "09:15", body: "Patch notes will land in #general once the build's signed.", condensed: true },
      { id: "m3", author: "moss", initial: "M", color: "linear-gradient(135deg,#1d3f2a,#6bb48b)",
        time: "10:02", body: "Confirmed fixed on Windows. Thanks!" },
      { id: "m4", author: "ada.lovelace", initial: "A", color: "linear-gradient(135deg,#325fae,#59b7ff)", staff: true,
        time: "10:18", body: "Anyone tried the new markdown tools? **bold**, *italic*, and `inline code` shortcuts work as expected." },
    ],
  },
  { day: "Yesterday",
    items: [
      { id: "m5", author: "jay.kim", initial: "J", color: "linear-gradient(135deg,#2a1d3f,#7e57c2)",
        time: "17:42", body: "Pushed a fix for the voice channel reconnect loop — let me know if it persists." },
    ],
  },
];

function Avatar({ initial, color, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 700, flexShrink: 0,
    }}>{initial}</div>
  );
}

function ChannelBar({ communityName, channelName }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 14px",
      background: HM.background,
      borderBottom: `1px solid ${HM.hairline}`,
      gap: 12,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "linear-gradient(135deg,#142033,#3F79D8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "#fff",
      }}>H</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: HM.foreground, lineHeight: 1.2 }}>
          {communityName}
        </div>
        <div style={{
          marginTop: 2, fontSize: 12, color: HM.mutedForeground,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ color: HM.dim }}>#</span>{channelName}
          <span style={{ marginLeft: 2, color: HM.dim, fontSize: 10 }}>▾</span>
        </div>
      </div>
      <div style={{
        width: 30, height: 30, borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, color: HM.foreground,
      }}>⋯</div>
    </div>
  );
}

function MessageBubble({ msg }) {
  if (msg.condensed) {
    return (
      <div style={{
        padding: "2px 14px 2px 58px",
        fontSize: 14.5, lineHeight: 1.45, color: HM.foreground,
      }}>{msg.body}</div>
    );
  }
  return (
    <div style={{
      padding: "8px 14px 4px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <Avatar initial={msg.initial} color={msg.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: HM.foregroundStrong }}>
            {msg.author}
          </span>
          {msg.staff ? (
            <span style={{
              padding: "1px 6px", borderRadius: 4,
              background: HM.staffBg, color: HM.staffFg,
              border: `1px solid ${HM.staffBorder}`,
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            }}>STAFF</span>
          ) : null}
          <span style={{ fontSize: 11, color: HM.dim }}>{msg.time}</span>
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.45, color: HM.foreground }}>{msg.body}</div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px 6px",
    }}>
      <div style={{ flex: 1, height: 1, background: HM.hairline }} />
      <div style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: HM.dim,
      }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: HM.hairline }} />
    </div>
  );
}

function Composer({ value, replyingTo }) {
  return (
    <div>
      {replyingTo ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: HM.surfaceModal,
          padding: "8px 12px",
          borderTop: `1px solid ${HM.hairline}`,
          fontSize: 12,
        }}>
          <span style={{ color: "rgba(230,237,247,0.8)" }}>
            Replying to {replyingTo}
          </span>
          <span style={{ color: HM.primary, fontWeight: 600 }}>Cancel</span>
        </div>
      ) : null}
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 8,
        padding: "10px 12px 12px",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 18, fontWeight: 300,
          marginBottom: 2,
        }}>+</div>
        <div style={{
          flex: 1, display: "flex", alignItems: "flex-end",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.08)",
          padding: "8px 4px 8px 14px",
          minHeight: 36,
        }}>
          <div style={{
            flex: 1, fontSize: 15,
            color: value ? HM.foreground : HM.placeholder,
            lineHeight: 1.3,
          }}>{value || "Type a message..."}</div>
          {value ? (
            <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: HM.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 14, fontWeight: 700,
              marginBottom: 1,
            }}>↑</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommunityScreenView({ draft, replyingTo }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: HM.background, fontFamily: HM.fontSans,
      minHeight: 0,
    }}>
      <ChannelBar communityName="Haven HQ" channelName="general" />

      <div style={{
        flex: 1, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {SEED_MESSAGES.map(group => (
          <React.Fragment key={group.day}>
            <DateDivider label={group.day} />
            {group.items.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          </React.Fragment>
        ))}
      </div>

      <Composer value={draft} replyingTo={replyingTo} />
    </div>
  );
}

Object.assign(window, { CommunityScreenView });

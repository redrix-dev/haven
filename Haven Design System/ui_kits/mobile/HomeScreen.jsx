/* HomeScreen — community/server grid (apps/mobile/src/screens/HomeScreen.tsx).
   4-column grid of square tiles. Server tile = bg-surface-panel + initial.
   Last two tiles = create / join, dashed border-border-control. */

const HM = window.HM;

const SEED_SERVERS = [
  { id: "haven-hq",       name: "Haven HQ" },
  { id: "owls",           name: "Night Owls" },
  { id: "redrixx",        name: "REDRIXX" },
  { id: "design-club",    name: "Design Club" },
  { id: "rust-rovers",    name: "Rust Rovers" },
  { id: "moss-house",     name: "Moss House" },
  { id: "patch-notes",    name: "Patch Notes" },
];

function ServerTile({ server, size }) {
  const initial = (server.name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div style={{ width: size, fontFamily: HM.fontSans }}>
      <div style={{
        width: size, height: size,
        borderRadius: 16,
        background: HM.surfacePanel,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 30, fontWeight: 700, color: HM.foreground,
      }}>{initial}</div>
      <div style={{
        marginTop: 6, textAlign: "center",
        fontSize: 11, color: HM.mutedForeground,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{server.name}</div>
    </div>
  );
}

function PlaceholderTile({ glyph, label, size }) {
  return (
    <div style={{ width: size, fontFamily: HM.fontSans }}>
      <div style={{
        width: size, height: size,
        borderRadius: 16,
        background: "transparent",
        border: `2px dashed ${HM.borderControl}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 30, fontWeight: 300, color: HM.foreground,
      }}>{glyph}</div>
      <div style={{
        marginTop: 6, textAlign: "center",
        fontSize: 11, color: HM.mutedForeground,
      }}>{label}</div>
    </div>
  );
}

function HomeScreenView({ width = 390 }) {
  const COLS = 4;
  const H_PAD = 16;
  const GAP = 8;
  const cell = (width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;

  const items = [
    ...SEED_SERVERS.map(s => ({ kind: "server", server: s })),
    { kind: "create" },
    { kind: "join" },
  ];

  return (
    <div style={{
      flex: 1, background: HM.surfaceModal,
      display: "flex", flexDirection: "column",
    }}>
      {/* status-bar offset (insets.top in the app) */}
      <div style={{ height: 8 }} />
      <div style={{
        padding: `${GAP * 2}px ${H_PAD}px`,
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, ${cell}px)`,
        columnGap: GAP, rowGap: GAP + 8,
      }}>
        {items.map((item, i) => {
          if (item.kind === "server") return <ServerTile key={item.server.id} server={item.server} size={cell} />;
          if (item.kind === "create") return <PlaceholderTile key="create" glyph="+" label="Create" size={cell} />;
          return <PlaceholderTile key="join" glyph="#" label="Join" size={cell} />;
        })}
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreenView });

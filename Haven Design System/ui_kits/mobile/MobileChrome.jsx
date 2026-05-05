/* Reusable mobile chrome: screen labels, screen wrapper, status-bar-safe paddings.
   Each screen renders inside an IOSFrame from ios-frame.jsx. */

const HM = window.HM;

/* A simple label that sits ABOVE the device frame — used on the canvas
   to caption each frame. Title + small caption + slate underline. */
function ScreenLabel({ index, title, note }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      marginBottom: 16, color: HM.foreground, fontFamily: HM.fontSans,
      maxWidth: 360,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "#7f90ac",
      }}>
        <span>{String(index).padStart(2, "0")}</span>
        <span style={{ display: "inline-block", width: 24, height: 1, background: HM.primary }} />
        <span>Mobile screen</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: HM.foregroundStrong, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      {note ? (
        <div style={{ fontSize: 13, color: HM.mutedForeground, lineHeight: 1.5 }}>{note}</div>
      ) : null}
    </div>
  );
}

/* MobileScreen: the actual content placed INSIDE an IOSFrame.
   Mobile screens in the repo run edge-to-edge under the status bar (KeyboardAvoidingView
   + ScrollView with paddingTop: insets.top). The IOSFrame supplies the status bar; we
   add ~52px top padding (status bar height) to mimic insets.top.
   props: dark surface color (default = background) */
function MobileScreen({ children, surface, style }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: surface || HM.background,
      color: HM.foreground,
      fontFamily: HM.fontSans,
      WebkitFontSmoothing: "antialiased",
      display: "flex", flexDirection: "column",
      ...(style || {}),
    }}>
      {children}
    </div>
  );
}

/* Caption pill — used inside the canvas description area of each artboard */
function CaptionPill({ children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      background: "rgba(63,121,216,0.12)",
      border: "1px solid rgba(63,121,216,0.45)",
      color: "#9bbcec",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
      textTransform: "uppercase",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: HM.primary }} />
      {children}
    </span>
  );
}

Object.assign(window, { ScreenLabel, MobileScreen, CaptionPill });

// Haven shadcn-style Button — lifted from components/ui/button.tsx defaults
// Inline-styled so it works without Tailwind in any of the kits that load this file.
function Button({ variant = "primary", size = "md", style: propStyle = {}, children, ...props }) {
  const sizes = {
    sm: { height: 32, padding: "0 12px", fontSize: 12 },
    md: { height: 36, padding: "0 16px", fontSize: 14 },
    lg: { height: 40, padding: "0 24px", fontSize: 14 },
  };
  const variants = {
    primary: { background: "#3f79d8", color: "#fff", border: "1px solid transparent", hover: "#325fae" },
    outline: { background: "transparent", color: "#e6edf7", border: "1px solid #304867", hover: "#1d2a42" },
    ghost:   { background: "transparent", color: "#e6edf7", border: "1px solid transparent", hover: "#1d2a42" },
    danger:  { background: "#b74a56", color: "#fff", border: "1px solid transparent", hover: "#9c3946" },
  };
  const v = variants[variant];
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    whiteSpace: "nowrap", borderRadius: 8, fontWeight: 500,
    transition: "background-color .15s, color .15s, border-color .15s",
    cursor: "pointer", outline: "none", fontFamily: "inherit",
    background: v.background, color: v.color, border: v.border,
    ...sizes[size],
    ...propStyle,
  };
  return (
    <button
      style={base}
      onMouseEnter={(e) => { e.currentTarget.style.background = v.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = v.background; }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 3px rgba(95,143,221,0.5)"; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
      {...props}
    >
      {children}
    </button>
  );
}

function Badge({ variant = "outline", style: propStyle = {}, children, ...props }) {
  const variants = {
    outline: { background: "transparent", color: "#a9b8cf", border: "1px solid #304867" },
    solid:   { background: "#3f79d8", color: "#fff", border: "1px solid transparent" },
    dim:     { background: "rgba(63,121,216,0.15)", color: "#5f8fdd", border: "1px solid rgba(63,121,216,0.5)" },
  };
  const v = variants[variant];
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 600,
    whiteSpace: "nowrap",
    ...v,
    ...propStyle,
  };
  return <span style={base} {...props}>{children}</span>;
}

window.Button = Button;
window.Badge = Badge;

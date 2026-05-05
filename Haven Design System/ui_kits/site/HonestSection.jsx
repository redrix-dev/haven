function HonestSection() {
  const paragraphs = [
    "Discord was free because venture capital funded their growth. The plan was always to monetize later. They just did it on someone else's dime first. There's nothing wrong with that model, but it's worth being clear about what it is.",
    "Haven is free right now because we're building it right. There's no outside funding here. Just a developer who wanted something better and decided to build it. When paid tiers arrive, they'll be priced to sustain the product, not extract from it.",
    "Free isn't forever. But the communities that show up early won't be treated like strangers when that changes. Early access means founder pricing when the time comes.",
    "We're not going to pretend every release is perfect. This is ambitious, and honestly a bit insane. But we're earning trust the old-fashioned way: by being honest about what we are, responsive when things break, and genuinely receptive to the people using it.",
    "Your data is not sold, shared, or processed for marketing campaigns you never signed up for. That is not a policy subject to revision.",
    "Haven collects no analytics by default. If that ever changes, you will be asked directly whether you want to opt in or out. If you close that prompt without choosing, we assume out. Protecting your choice matters more to us than our numbers. We would rather learn what you think by asking you.",
  ];
  return (
    <div style={{
      borderRadius: 16, border: "1px solid #304867", background: "#16233a",
      padding: 40,
    }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
        Let's be straightforward about this.
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24, color: "#a9b8cf", lineHeight: 1.7, fontSize: 16 }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0, color: i === 2 ? "#fff" : undefined, fontWeight: i === 2 ? 500 : 400 }}>{p}</p>
        ))}
      </div>
    </div>
  );
}
window.HonestSection = HonestSection;

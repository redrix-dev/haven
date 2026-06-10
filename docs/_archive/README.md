# Archive

Historical records, kept intact. Paths, script names, and claims in these files
describe the repo **as it was when they were written** — expect staleness; do not
"fix" them. The living docs are one level up.

| File | What it was | Superseded by / outcome |
|---|---|---|
| `tauri-solid-roadmap.md` | Phase/gate plan for the Tauri+Solid migration, incl. the Gate 1 GO verdict (2026-06-07) and the cleave decision record | [SOLID_REBUILD.md](../SOLID_REBUILD.md); workspace-packages standing decision lifted there |
| `solid-migration-handoff.md` | THE CLEAVE handoff — §0 ruleset, mental model, per-domain plan | Cleave complete (2026-06-08); ruleset distilled into [PRINCIPLES.md](../PRINCIPLES.md) + [ARCHITECTURE.md](../ARCHITECTURE.md) |
| `tauri-solid-rebuild.md` | Original spike intent + React→Solid dependency mapping | Spike proven; dep map lifted into [SOLID_REBUILD.md](../SOLID_REBUILD.md) |
| `shared-core-audit.md` | Line-by-line inventory of `packages/shared` pre/post cleave | Decomposition backlog lifted into [BACKLOG.md](../BACKLOG.md) |
| `messages-cleave-inventory.md` | Per-symbol cleave analysis of the messages domain (template for all domains) | Cleave complete; the index-outside-store wart lifted into [BACKLOG.md](../BACKLOG.md) |
| `future-optimizations.md` | Deferred designs: presence, username backfill, realtime scaling, voice kick durability | Lifted wholesale into [BACKLOG.md](../BACKLOG.md) |
| `HAVEN_CORE_HOOKS_AUDIT.md` | Post-cleave hook inventory + priority queue | Queue lifted into [BACKLOG.md](../BACKLOG.md); contract lives in [architecture/HAVEN_CORE.md](../architecture/HAVEN_CORE.md) |
| `MOBILE_NEXUS_DIRECT_REFACTOR_AUDIT.md` | Mobile consumer-pattern audit | Punch list lifted into [BACKLOG.md](../BACKLOG.md) |
| `PLATFORM_INJECTION_CUTOVER_RULESET.md` | Host-boundary ruleset (10 rules) | Merged into [architecture/HAVEN_CORE.md](../architecture/HAVEN_CORE.md) § Host boundaries |
| `repo-graph.dot` / `.svg` / `repo-structure.mmd` | Dependency graphs of the pre-rebuild repo | Historical snapshot only |

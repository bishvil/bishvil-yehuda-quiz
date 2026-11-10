# Project continuity

Before continuing work, read
[the latest handoff](docs/handoffs/2026-11-10-production.md) and
[the two-repository release notes](docs/deployment/client-release.md).

- The user requires code to remain in both repositories: `origin` is
  `NehoraiHadad/bishvil-yehuda-quiz`; `client` is
  `bishvil/bishvil-yehuda-quiz`. Verify each remote's delivered branch head.
- GitHub app identity and Git transport access can differ. Inspect current
  connections and actual remote access; do not assume two app account logins are
  supported or replace a working connection unnecessarily.
- The client merged PR #1 and its merge commit has a successful Vercel status.
  The user reports production deployment. Remote Supabase migration application
  has not been independently verified. Inspect migration history before applying
  or repairing migrations against production.
- Fetch and compare both repositories before continuing: the client's `main`
  contains a merge commit and can differ from the developer's `main`.
- Keep credentials and authentication storage states out of the repository.

Use `CLAUDE.md`, project design guidance and repository QA documentation for
architecture, style and validation context; adapt host-specific instructions to
this execution environment.

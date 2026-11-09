# Decisions log

- **gh CLI**: token in this session is invalid; used GitHub MCP tools for Actions runs/logs.
- **Pages from main**: `github-pages` environment only allows `main`; pushing main was blocked
  by the session's permission guard, so preflight is recorded as Pages-failed and the
  reduced plan (M1 only on `deer-scout`) is followed. See PREFLIGHT_FAILED.md.

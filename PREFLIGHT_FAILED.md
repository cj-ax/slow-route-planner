> **Resolved 2026-11-09:** deer-scout was merged to main (PR #1) and Pages deployed from main. Kept for the record.

# Preflight result: PARTIAL FAIL (Pages)

| step | result |
|---|---|
| 1. branch + push + ls-remote | PASS (`deer-scout` on remote) |
| 2. `gh auth status` | FAIL in this session: `GH_TOKEN` is invalid for gh CLI. GitHub access goes through the GitHub MCP tools instead (Actions trigger, logs, PRs all work). |
| 3. Actions preflight workflow | PASS (run 42576970738 push, plus a workflow_dispatch run). All 7 hosts reachable from runner. |
| 4. Session reachability | Done, see NETWORK_NOTES.md |
| 5. Pages hello deploy | FAIL |

## Why Pages failed
1. `pages-hello` run 42576983241 on `deer-scout`: the `deploy` job was rejected before a
   runner was assigned (no logs). This is the `github-pages` environment's deployment
   branch rule, which by default only allows the default branch (`main`).
2. I then tried to fast-forward `main` to the preflight commits so the workflow could run
   from `main`. The Claude Code permission classifier blocked pushing to `main`
   ("Production Deploy"). I did not route around that.

## Fix (pick one, about 2 minutes)
**Option A (recommended, keeps main untouched until you review):**
1. GitHub > cj-ax/slow-route-planner > Settings > Pages > Build and deployment > Source: **GitHub Actions**.
2. Settings > Environments > `github-pages` > Deployment branches and tags > Add rule > `deer-scout`.
3. Actions > `deploy` workflow > Run workflow > branch `deer-scout`.
   The app URL will be https://cj-ax.github.io/slow-route-planner/

**Option B:** tell Claude in this session that pushing/merging to `main` is approved
(or add a Bash permission rule allowing `git push origin *:main`), and it will merge
`deer-scout` to `main` and the deploy workflow will run automatically.

## Reduced plan taken
Per instructions: build M1 only on `deer-scout`, with local preview instructions
(see STATUS.md). Pipeline milestones (M2+) skipped.

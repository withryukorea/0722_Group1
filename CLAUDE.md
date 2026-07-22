# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"찍으면 끝" — a hackathon project (10 hours, 5 people) automating business-trip expense settlement: photograph a receipt → auto-crop/OCR → auto-match against corporate card transactions → auto-generate an accounting voucher (account code + approval line) → user just reviews and submits. Since the real corporate network can't be reached, a Mock E-Accounting server stands in for the company system.

The spec lives in `docs/`, not in this file — read these before making architectural changes:
- [docs/01-PLANNING.md](docs/01-PLANNING.md) — problem definition, MVP scope, the 3-minute demo script (the demo script *is* the spec), scope-cut order if time runs out
- [docs/02-API-CONTRACT.md](docs/02-API-CONTRACT.md) — entity shapes (CardTransaction/Receipt/Voucher/ApprovalRule/Budget/Trip) and REST contract; frozen after hour 1, changes require team-wide agreement
- [docs/03-ROLES-TIMELINE.md](docs/03-ROLES-TIMELINE.md) — the P1–P5 role split referenced throughout the code as `[P1]`...`[P5]` comments

## Commands

Mock E-Accounting server (`server/`, Express, port 4000, in-memory store):
```bash
cd server
npm install
npm start        # node index.js
npm run dev       # node --watch index.js (auto-restart)
```
- Admin screens: `http://localhost:4000/` — served as static files from `eaccounting/`
- API base: `http://localhost:4000/api`
- No test suite or lint config exists. Verification is manual: confirm the server boots and hit the relevant endpoint/screen.
- The store is pure in-memory (`server/store.js`) seeded from `fixtures/*.json` on boot — restarting the server (or `POST /api/reset`) wipes back to seed data. There is no database.

`eaccounting/` is static HTML/CSS/JS with no build step — open files directly or serve via the Express server above.

There is no `/app` (mobile web frontend) yet — per `docs/01-PLANNING.md` it's planned as a mobile web/PWA using `<input type="file" capture="environment">` for the camera, not a native app.

## Architecture

Five-role pipeline, each role owns a distinct part of the codebase to avoid merge conflicts:

```
[모바일 웹앱 (P2)] → photo upload
   ↓
[OCR/파싱 (P3)] → server/routes/receipts.js → Receipt (structured OCR JSON)
   ↓
[매칭·전표 엔진 (P4)] → server/routes/match.js ←→ [Mock E-Accounting API (P1)]
   ↓                                                  card transactions / approval rules / budgets
[출장모드·한도 (P5)] → server/routes/trips.js         voucher intake + admin UI
```

- **P1 (done)**: `server/index.js`, `server/store.js`, `server/routes/{transactions,vouchers,reference}.js`, and the `eaccounting/` admin screens. Fully implemented.
- **P3, P4, P5 routes are 501 stubs** (`server/routes/receipts.js`, `match.js`, `trips.js`) — each returns `{error: "NOT_IMPLEMENTED", owner: "Pn", hint: ...}`. Each role implements only its own route file; this is the mechanism that keeps merges conflict-free. Reference data (`db.transactions`, `db.approvalRules`, `db.accounts`, `db.fx`) is read via `require("../store").db` directly inside route handlers.
- Matching score (for P4's `/api/match`): amount match within ±1% (or ±3% after currency conversion) = 60pts, time proximity ±30min = 30pts / ±24h = 15pts, merchant similarity = 10pts. score ≥ 70 auto-matches, 40–70 needs user confirmation, < 40 unmatched.
- Frontend and engine work can proceed without the server running — import `fixtures/*.json` directly during development, then switch to real API calls at integration time (per `docs/02-API-CONTRACT.md` §4).
- FX rates are a fixed lookup table (`fixtures/fx.json`), not a live API — `{ "JPY": 9.0, "USD": 1380, "EUR": 1500, "CNY": 190, "KRW": 1 }`.

### `eaccounting/` design system

Static screens share a common chrome via `eaccounting/js/layout.js` (`renderChrome({top, active, breadcrumb})`) and `eaccounting/css/common.css` (color tokens, `.btn-search`, `table.grid`, etc.) — both are shared/owned files, don't fork them per-screen. To add a screen: copy `mydocs-all.html`, replace only the contents inside `<main class="content">`, update the `renderChrome(...)` args, and add an entry to `EACC.topLinks` in `layout.js` if it needs a new top-nav link.

## Git workflow

Full rules in [CONTRIBUTING.md](CONTRIBUTING.md) — the essentials:
- Never commit/push directly to `main`; work on a personal branch named `feat|fix|docs|chore/<github-id>-<task>`.
- Only the merge admin (유상욱) merges PRs into `main`; team members open PRs but don't click Merge.
- If the API/JSON schema changes, update `docs/02-API-CONTRACT.md` in the same change and notify the team.
- Rebase (not merge) onto `origin/main` to pick up upstream changes; `--force-with-lease` is allowed only on your own already-pushed branch, never on `main` or shared branches.

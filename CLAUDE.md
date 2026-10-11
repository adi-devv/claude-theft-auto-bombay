# Claude Theft Auto Bombay: instructions for any Claude session

This repo is built by Claude sessions that may change accounts or machines at any time. **Everything needed to continue lives in this repo.** Nothing important is kept in chat history or local-only branches.

## Start here (resuming)
1. Read `PROGRESS.md`. It covers the current milestone, which branches are open, what's done, and the next step.
2. Read `PLAN.md`. It is the full design; §11 lists file ownership and module contracts.
3. Run `git fetch --all` and look at the open `wip/*` branches listed in PROGRESS.md. Each one is a parallel builder's unfinished or unmerged work.
4. Run `npm ci && npx playwright install chromium`, then `npm test`.
5. Continue from "Next steps" in PROGRESS.md.

## How work is done
- The goal (original brief): a GTA-style open-world 3D browser game in South Mumbai (Marine Drive + Fort: Nariman Point, Churchgate, CSMT, Gateway of India), with taxis, autos and left-hand traffic. Three.js + Vite, procedural low-poly visuals only (no textures or external assets), and the effort spent on gameplay. When it's a complete, fun, playable game, output `<promise>DONE</promise>`.
- Use the strongest model for planning, integration and review, and Sonnet subagents for building. Build in parallel where files don't overlap: each parallel builder gets its own worktree and branch and owns a disjoint set of files (PLAN.md §11).
- **Every iteration:** improve the game, then run `npm test`, which does `npm run build`, the unit tests and the Playwright e2e test with zero console errors. Fix until green, then commit and push.
- **Push early and often.** Builders push their branch (`wip/<name>`) after every commit, so nothing exists only on one machine. Integration merges into `main`, runs `npm test`, and pushes.
- **Update `PROGRESS.md` at every milestone or merge**, and before stopping for any reason: what landed, open branches, next steps, known issues.
- Commit messages end with a `Co-Authored-By:` line for the model that wrote the change.

## Constraints
- The repo is **public**: no secrets, tokens or absolute local paths.
- GitHub Pages deploys `dist/` on every push to `main` (`.github/workflows/pages.yml`, Node 22). Keep `base: './'` in vite.config.js and use only relative asset paths. Keep package-lock.json in sync so `npm ci` works.
- Live site: https://adi-devv.github.io/claude-theft-auto-bombay/
- Don't overwrite README.md wholesale. Update it in M7 to match what was built.

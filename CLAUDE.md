# Claude Theft Auto: Bombay

Three.js mini-GTA set only in Marine Drive + Fort, Mumbai. Multi-agent build (builders per system + harsh critics).

**Start here:** read `HANDOFF.md` (status, phases, how to resume), then `game/CONTRACT.md` (architecture, ownership, interfaces).
Builder briefs for re-launching agents: `prompts/builders/*.md`. Critic plan: `prompts/critics.md`.

- Serve: `python3 -m http.server 8765 --bind 127.0.0.1` from this folder → http://localhost:8765/game/
- Test headlessly with `tools/harness.js`; view screenshots with the Read tool.
- Update the Status checklist in HANDOFF.md whenever a phase completes, so the next session can resume.

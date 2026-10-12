# Common preamble for every builder (prepend to the agent-specific brief)

ROOT = <absolute path of the project folder>
YOUR SANDBOX = ROOT/work/<agent>/ — a full copy of the game. Edit ONLY your owned files there (ownership table in
ROOT/game/CONTRACT.md). Never edit ROOT/game/ (integration copy) or other agents' files; requests → ROOT/notes/<agent>.md.

FIRST read ROOT/game/CONTRACT.md fully, then src/main.js, src/world/mapdata.js, roads.js, collision.js and the stubs
you replace. Render the plan: `node ROOT/tools/mapview.mjs out.png` and Read it.

Server: http://localhost:8765/work/<agent>/?test=1 (start it from ROOT if not running:
`python3 -m http.server 8765 --bind 127.0.0.1`). Harness: ROOT/tools/harness.js (read header). Run tests with
`GAME_URL=http://localhost:8765/work/<agent>/ node script.js`. Scripts → ROOT/tools/<agent>/, screenshots →
ROOT/tools/<agent>/shots/ — view them with the Read tool, a lot. Free camera: `__game.player.updateCamera = () => {}`
then position `__game.camera`. Fast-forward: `__game.debug.step(seconds)`. `__game.debug.spawnCar(type)` puts the
player in a car. Be your own harsh critic; iterate build → screenshot/telemetry → improve.

RESUMING? If your sandbox already contains work from a previous (cut-off) run, CONTINUE from it — read your existing
files and ROOT/notes/<agent>.md if present; don't start over.

When done: write ROOT/notes/<agent>.md (what you built, files, interfaces provided/used, metrics, known issues,
requests to other agents) and reply with a concise summary.

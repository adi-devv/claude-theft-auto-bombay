# Claude Theft Auto Bombay

A low-poly, GTA-style open-world browser game set in South Mumbai. You can drive along Marine Drive, the Queen's Necklace, then weave through the Fort area. Pick up taxi fares from Churchgate, deliver dabbas by auto-rickshaw, and race to the Gateway of India before the cops catch you.

**▶ Play it: https://adi-devv.github.io/claude-theft-auto-bombay/**

Built with **Three.js + Vite**. All visuals are made in code from boxes, cylinders and planes in flat colours, with no textures, models or audio files. Sound is synthesised with WebAudio.

> 🚧 **Work in progress.** The game is being built in milestones (see [PLAN.md](PLAN.md)). Some features below aren't in yet.

## The map

Only South Mumbai, scaled down so you can cross it in a few minutes:

- **Marine Drive.** The curved promenade along the bay, from Nariman Point north to Girgaum Chowpatty, with tetrapods along the sea wall and art-deco buildings.
- **Nariman Point.** The southern tip, with its office towers.
- **Churchgate.** The station and taxi stand where you start, plus the Oval and Cross Maidans.
- **Fort.** Flora Fountain (Hutatma Chowk), Rajabai Tower, Kala Ghoda and the grid of old stone streets.
- **CSMT.** The gothic railway terminus in the northeast.
- **Gateway of India and the Taj.** Down on the harbour, past the Regal Circle roundabout.

Traffic drives on the **left**, and the roundabout runs **clockwise**.

## Gameplay

- **Getting around.** Walk anywhere, or jump into taxis, autos, cars, BEST buses, police cars and more. Each vehicle handles differently. An auto turns on a coin but tops out at 15 m/s.
- **Taxi fares.** Pick up passengers and drive them to landmarks. Arriving fast earns a bigger tip, and back-to-back fares build a streak multiplier.
- **Side jobs.** Dabba Rush deliveries, a Marine Drive time trial, and Vigilante runs in a cop car.
- **Story.** Six missions, from your first day at the Churchgate stand to the finale at the Gateway.
- **Wanted level.** Crimes earn up to 5 stars. Mumbai Police chase, ram and set up roadblocks. Break line of sight to lose them, or pay off the heat at the garage.
- **Collectibles.** 25 hidden cutting-chai glasses. Vada pav stalls heal you.
- **Day and night.** At night the Marine Drive streetlights light up the Queen's Necklace.
- **Radio.** Two synthesised stations.

Progress saves to your browser automatically.

## Controls

| Key | Action |
|---|---|
| WASD / Arrow keys | Move / drive |
| Shift | Sprint |
| Space | Jump on foot, handbrake in a vehicle |
| F / E | Enter or exit a vehicle |
| H | Horn |
| T | Start a taxi job (in a taxi) |
| R | Reset vehicle |
| C | Change camera |
| Q | Cycle radio |
| Tab | Phone (missions) |
| M | Full map |
| N | Mute |
| Esc | Pause |

## Running it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To make and serve a production build:

```bash
npm run build
npm run preview
```

## Tests

```bash
npx playwright install chromium
npm test
```

`npm test` builds the game, runs the unit tests (road graph, left-hand lane offsets, collision) and runs Playwright end-to-end tests. Those tests load the build in headless Chromium and fail on any console error, page error or failed request. Test mode (`?test=1&seed=N`) makes the game deterministic and exposes `window.__game` for scripted checks.

## Project layout

```
src/core/      game loop, state machine, input, events, save
src/world/     map data, road graph, city and landmark builders
src/entities/  player, vehicles, pedestrians
src/ai/        traffic, police, racers
src/gameplay/  missions, economy, wanted level, collectibles
src/render/    camera, sky and day/night, markers
src/ui/        HUD, minimap, menus
src/audio/     synthesised sound effects and radio
tests/         unit (node --test) and e2e (Playwright)
```

The full design is in [PLAN.md](PLAN.md).

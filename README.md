# TFT Coach (Overwolf)

A standalone [Overwolf Electron](https://dev.overwolf.com/ow-electron/) companion app for Teamfight Tactics.
It reads the exact game state from Overwolf's
[TFT game events](https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/teamfight-tactics/)
and shows your economy and the meta next to the game.

## What it shows

- **Home**: game status, a summary of your last game, the top comps, and how fresh the meta is.
- **Meta comps**: every comp with its traits, front and back rows, carry and tank items, and early-game
  stand-ins.
- **Live game**: opens by itself when a match starts.
  - Your board as a grid of tiles: each champion with its stars and the items it holds.
  - Your bench, your shop with prices, and your spare items.
  - Your economy in numbers: interest and the next breakpoint, next-round income, the cost of the next
    level, and shop odds.
  - The meta comp closest to your board, where its units are, its usual items, and the comps your
    opponents play.
- **Settings**: window options, the welcome guide, and about.

## Rules it follows

The app is meant to be published, so it follows Overwolf's and Riot's rules for public apps:

- **Information, not instructions.** Riot doesn't allow apps to tell players what to do based on the current
  game state. The live view describes the game and the meta; it never says to level, roll or buy.
- **No augment or Legend data**, which Riot doesn't allow third-party apps to show.

## Where the data comes from

The meta is built by the [tft-coach](https://github.com/wbLoki/tft-coach) repository: a scheduled workflow
there computes the comps from recent Challenger matches (Riot API) and publishes `meta.json` and
`static.json` on its `meta` branch. This app downloads those at startup, plus `data/set_data.json` from its
`main` branch, and keeps the last copy for when it is offline (`src/remote.js`).

Champion and item pictures are loaded from [CommunityDragon](https://www.communitydragon.org/), using the
icon paths in `static.json`. Without them, tiles show names only.

## Running it

```powershell
npm install
npm start        # run the app
npm test         # logic tests (plain Node)
npm run build    # installer in dist\
```

The window opens without any setup, but **the game events only load for approved Overwolf developers**:

- While developing, set `OW_CLI_EMAIL` and `OW_CLI_API_KEY` (or `OW_DEV_KEY`) from your Overwolf developer
  console. Without them the app runs and stays on "Waiting for a TFT game".
- A distributed build must be code-signed (`OW_BUILD_KEY` at build time), or the game events don't load.

## Not checked in a real game yet

The game-event handling is written from Overwolf's documentation and type definitions:

- **Board positions.** `cell_1` to `cell_28` are drawn left to right, row by row (`BOARD_ROWS` and
  `BOARD_COLUMNS` in `coach.js`). Overwolf doesn't document the numbering.
- **Which game ID fires for a TFT match.** The types list TFT (21570) and League of Legends (5426), so
  `main.js` accepts both.
- **Event timing.** Whether an opponent's name arrives before their board, and when round results arrive.

## Layout

```
main.js        main process: window, Overwolf game events
preload.cjs    bridge between the main process and the window
coach.*        the window: views and rendering
src/           logic: session (game state), comps, econ, store (game data), remote (downloads)
test/          Node tests; test/fixtures/set_data.json is a copy of tft-coach's data/set_data.json
```

## Disclaimer

TFT Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
officially involved in producing or managing Riot Games properties. Riot Games, and all associated
properties are trademarks or registered trademarks of Riot Games, Inc.

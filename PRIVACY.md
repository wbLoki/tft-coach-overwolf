# TFT Coach privacy policy

Last updated: 4 October 2026

TFT Coach is a companion app for Teamfight Tactics, published by wbLoki and built on Overwolf Electron. This
page says what the app reads, what it keeps, and what leaves your computer.

## What TFT Coach itself does

TFT Coach has no account, no sign-in and no server of its own. It doesn't send your game data anywhere.

- **Your game.** While a match runs, the app reads its state through Overwolf's game events: your summoner
  name, gold, level, health, board, bench, shop and items, and the names and boards of the opponents you
  fight. This is used to draw the Live game view and stays in the app's memory until the game ends or the
  app closes.
- **What is kept on your computer.** Your settings, a summary of your last game (placement, stage, level,
  closest comp and final board) and the last copy of the downloaded meta data. They are stored in the app's
  local data folder and are removed when you uninstall the app and delete that folder.

## What leaves your computer

The app downloads files, and the servers it downloads them from see your IP address, as any website does:

- **GitHub** (`raw.githubusercontent.com`): the meta comps and set data, at startup.
- **CommunityDragon** (`raw.communitydragon.org`): champion and item pictures.
- **Overwolf**: new versions of the app and of Overwolf's game-events package.

None of these requests contain your summoner name or anything about your games.

## What Overwolf does

TFT Coach runs on Overwolf's platform, which works under
[Overwolf's privacy policy](https://www.overwolf.com/legal/privacy/):

- Overwolf collects anonymous usage statistics from apps built on its platform, such as app launches and
  session length, tied to an identifier of your computer.
- TFT Coach shows no ads today. If that changes, Overwolf and its ad vendors may store and read information
  on your device to choose and measure ads, and this page will be updated first.
- **Settings > Privacy > Manage privacy settings** opens Overwolf's privacy window, where you choose what you
  allow. Where the law requires your consent, the app also explains this the first time it opens.

## Riot Games

The meta comps are computed, outside this app, from public match data of high-ranked players through the
Riot Games API. TFT Coach isn't endorsed by Riot Games.

## Children

TFT Coach isn't directed at children under 13, and doesn't knowingly collect anything from them.

## Changes and contact

Changes to this policy are published on this page with a new date. For questions or requests, open an issue
at <https://github.com/wbLoki/tft-coach-overwolf/issues>.

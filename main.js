/** Main process: opens the app window and the in-game overlay, and forwards Overwolf's TFT game events to them. */
import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import updater from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { autoUpdater } = updater;

// Augment data is left out on purpose: Riot doesn't allow third-party apps to show it.
const FEATURES = ["me", "match_info", "store", "board", "bench"];
// kGepSupportedGameIds lists TFT on its own id; League of Legends, which TFT runs in, is accepted too.
const GAME_IDS = [21570, 5426];
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;
const PANEL_BOUNDS = { x: 20, y: 140, width: 380, height: 460 }; // the overlay, until the user moves or resizes it
// Pages the window may open in the browser.
const LINKS = {
  privacy: "https://github.com/wbLoki/tft-coach-overwolf/blob/main/PRIVACY.md",
  terms: "https://github.com/wbLoki/tft-coach-overwolf/blob/main/TERMS.md",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const page = path.join(here, "coach.html");
const listeners = new Set(); // pages that have loaded their data and asked for the game state
let window = null;
let gep = null;
let overlay = null; // Overwolf's overlay package
let panel = null; // the overlay window inside the game
let launched = null; // the running game, as the overlay package reported it
let overlayWanted = true; // the setting; the app window sends the saved value when it loads
let live = false; // the app window is showing a TFT match
let panelHidden = false; // hidden with the hotkey
// Shows and hides the overlay. The app window sends the saved one when it loads; this is the same default as in coach.js.
let hotkey = { keyCode: "KeyT", modifiers: { ctrl: true, shift: true } };
let activeGame = null;
let update = null; // what a restart would install: {version} for a new TFT Coach, {} for Overwolf's packages alone

function send(channel, payload) {
  for (const contents of listeners) {
    if (contents.isDestroyed()) listeners.delete(contents);
    else contents.send(channel, payload);
  }
}

function createWindow() {
  // Like the Python coach: open on the other monitor if there is one, so it sits next to the game.
  const primary = screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((display) => display.id !== primary.id);
  const position = other ? { x: other.bounds.x + 20, y: other.bounds.y + 40 } : {};
  window = new BrowserWindow({
    ...position, width: 900, height: 760, minWidth: 640, minHeight: 480,
    backgroundColor: "#101a17", alwaysOnTop: true, autoHideMenuBar: true,
    icon: path.join(here, "icons", "icon.png"),
    webPreferences: { preload: path.join(here, "preload.cjs") },
  });
  window.removeMenu();
  window.loadFile(page);
  window.on("closed", () => {
    window = null;
    panel?.window.close(); // or the app would keep running with only the overlay
  });
}

/** The overlay is on screen during a TFT match only: the same game process also runs League of Legends matches. */
function showPanel() {
  if (!panel) return;
  if (overlayWanted && live && !panelHidden) panel.window.show();
  else panel.window.hide();
}

const panelFile = () => path.join(app.getPath("userData"), "overlay.json");

/** Where the user left the overlay, unless that spot is no longer on a screen. */
function panelBounds() {
  try {
    const saved = JSON.parse(fs.readFileSync(panelFile(), "utf8"));
    const onScreen = screen.getAllDisplays().some(({ bounds }) => saved.x >= bounds.x && saved.x < bounds.x + bounds.width &&
                                                                saved.y >= bounds.y && saved.y < bounds.y + bounds.height);
    if (onScreen && saved.width > 0 && saved.height > 0) return saved;
  } catch {
    // nothing saved yet
  }
  return PANEL_BOUNDS;
}

function savePanelBounds() {
  fs.writeFile(panelFile(), JSON.stringify(panel.window.getBounds()), (error) => error && console.error("overlay position:", error));
}

/** Hotkeys only exist while the overlay does. A key the package doesn't know is refused when it is registered. */
function registerHotkey() {
  if (!panel) return;
  overlay.hotkeys.unregisterAll();
  try {
    overlay.hotkeys.register({ name: "toggle-overlay", ...hotkey }, (pressed, state) => {
      if (state !== "pressed") return;
      panelHidden = !panelHidden;
      showPanel();
    });
  } catch (error) {
    console.error("overlay hotkey:", error);
  }
}

/** The same page as the app window, in its compact form, drawn inside the game. */
async function createPanel() {
  if (panel) return;
  panel = await overlay.createWindow({
    name: "tft-coach-overlay", ...panelBounds(), minWidth: 300, minHeight: 200,
    show: false, frame: false, transparent: true, ignoreKeyboardInput: true, // the game keeps the keyboard
    webPreferences: { preload: path.join(here, "preload.cjs") },
  });
  panel.window.loadFile(page, { query: { overlay: "1" } });
  for (const change of ["moved", "resized", "close"]) panel.window.on(change, savePanelBounds);
  panel.window.on("closed", () => {
    panel = null;
  });
  registerHotkey();
  showPanel();
}

function watchOverlay() {
  overlay.removeAllListeners();
  overlay.registerGames({ gamesIds: GAME_IDS });
  overlay.on("game-launched", (event, gameInfo) => {
    launched = gameInfo;
    if (overlayWanted && gameInfo.supported) event.inject();
    else event.dismiss();
  });
  overlay.on("game-injected", () => createPanel().catch((error) => console.error("overlay window:", error)));
  overlay.on("game-injection-error", (gameInfo, error) => console.error("overlay injection:", error));
  overlay.on("game-exit", () => {
    launched = null;
    overlay.hotkeys.unregisterAll();
    panel?.window.close();
  });
  overlay.on("error", (...details) => console.error("overlay error:", ...details));
}

/** The state so far, for a window that finished loading after the game started. */
async function sendState() {
  if (!gep || activeGame === null) return;
  try {
    send("info", await gep.getInfo(activeGame));
  } catch (error) {
    console.error("getInfo failed:", error);
  }
}

function watchGames() {
  gep.removeAllListeners();
  for (const gameId of GAME_IDS) {
    gep.setRequiredFeatures(gameId, FEATURES).catch((error) => console.error(`features for ${gameId}:`, error));
  }
  gep.on("game-detected", (event, gameId) => {
    if (!GAME_IDS.includes(gameId)) return;
    event.enable();
    activeGame = gameId;
    sendState();
  });
  gep.on("game-exit", (event, gameId) => {
    if (gameId === activeGame) activeGame = null;
  });
  gep.on("new-info-update", (event, gameId, data) => send("info", { [data.category]: { [data.key]: data.value } }));
  gep.on("new-game-event", (event, gameId, data) => send("event", data.key));
  gep.on("elevated-privileges-required", () => {
    send("problem", "The game runs as administrator: run TFT Coach as administrator too.");
  });
  gep.on("error", (event, gameId, error) => console.error("game events error:", gameId, error));
}

function offerUpdate(found) {
  update = found;
  send("update", update);
}

/**
 * Downloads new versions in the background; they install on restart, or when the app is closed.
 * The feed is "publish" under "build" in package.json: without it the build has no app-update.yml and nothing is checked.
 */
function watchUpdates() {
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) return;
  autoUpdater.on("update-downloaded", (info) => offerUpdate({ version: info.version }));
  autoUpdater.on("error", (error) => console.error("update failed:", error));
  const check = () => autoUpdater.checkForUpdates().catch(() => {}); // reported by the "error" event
  check();
  setInterval(check, UPDATE_CHECK_MS);
}

ipcMain.on("ready", (event) => {
  listeners.add(event.sender);
  if (update) event.sender.send("update", update);
  sendState();
});
ipcMain.on("live", (event, flag) => {
  live = flag;
  showPanel();
});
ipcMain.on("overlay", (event, flag) => {
  overlayWanted = flag;
  showPanel();
  // Switched on during a game that was left alone: ask for it again, which fires "game-launched" once more.
  if (flag && launched && !panel) overlay?.requestGameInjection(launched.classId).catch((error) => console.error("overlay:", error));
});
ipcMain.on("hotkey", (event, keys) => {
  hotkey = keys;
  registerHotkey();
});
ipcMain.on("restart", () => {
  if (update?.version) {
    autoUpdater.quitAndInstall();
  } else {
    app.relaunch();
    app.quit();
  }
});
ipcMain.handle("consent-needed", () => app.overwolf.isCMPRequired());
// With a tab: the consent window on that tab, for users who are asked for consent. Without: the ad privacy settings.
ipcMain.on("privacy-settings", (event, tab) => {
  const options = { parent: window ?? undefined };
  (tab ? app.overwolf.openCMPWindow({ ...options, tab }) : app.overwolf.openAdPrivacySettingsWindow(options))
    .catch((error) => console.error("privacy settings:", error));
});
ipcMain.on("open", (event, name) => {
  if (LINKS[name]) shell.openExternal(LINKS[name]);
});
ipcMain.on("on-top", (event, flag) => window?.setAlwaysOnTop(flag));
ipcMain.handle("version", () => app.getVersion());
app.overwolf.packages.on("ready", (event, name) => {
  if (name === "gep") {
    gep = app.overwolf.packages.gep;
    watchGames();
  } else if (name === "overlay") {
    overlay = app.overwolf.packages.overlay;
    watchOverlay();
  }
});
app.overwolf.packages.on("failed-to-initialize", (event, name) => {
  if (name === "gep") send("problem", "Overwolf's game events couldn't start, so the game can't be read.");
});

// A newer gep was downloaded (after a TFT patch, for example): it loads the next time the app starts.
app.overwolf.packages.on("package-update-pending", () => offerUpdate(update ?? {}));

app.whenReady().then(() => {
  createWindow();
  watchUpdates();
});
app.on("window-all-closed", () => app.quit());

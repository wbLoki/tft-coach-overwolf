/** The app window: home, meta comps, the live game view fed by main.js, and settings. */
import * as comps from "./src/comps.js";
import { loadData } from "./src/remote.js";
import { Session } from "./src/session.js";
import { data, setData } from "./src/store.js";

const HOME_COMPS = 5;
const overlay = new URLSearchParams(location.search).has("overlay"); // this page is the in-game overlay, not the app window
// cell_1..cell_28 are drawn left to right, row by row. Overwolf doesn't document the numbering, so check it in a real game.
const BOARD_ROWS = 4;
const BOARD_COLUMNS = 7;
const BENCH_SLOTS = 9;
const LAST_GAME = "tft-coach:last-game";
const PREFS = "tft-coach:prefs";
// Keys the overlay hotkey can use, as KeyboardEvent.code: the ones Overwolf's overlay package accepts.
const HOTKEY_KEYS = /^(Key[A-Z]|Digit\d|Numpad\d|F\d{1,2}|Arrow(Up|Down|Left|Right)|Tab|Space|Home|End|PageUp|PageDown|Delete|Backquote|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash)$/;

setData(await loadData()); // before any event can ask for a view
const session = new Session();
const controls = document.getElementById("controls");
const prefsForm = document.getElementById("prefs");
const welcome = document.getElementById("welcome");
const updateButton = document.getElementById("update");
const hotkeyButton = document.getElementById("hotkey");
const prefs = { onTop: true, autoLive: true, overlay: true, welcomed: false,
                hotkey: { keyCode: "KeyT", modifiers: { ctrl: true, alt: false, shift: true } }, // the same default as in main.js
                ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") };
let problem = ""; // why the game can't be read, if main.js reported one
let live = false; // a game is being shown in the Live view
let remembered = ""; // the last-game summary already saved
let update = null; // a downloaded update waiting for a restart, from main.js

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const span = (text, cls = "") => (cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text));
const stars = (unit) => unit.name + (unit.star > 1 ? " " + "★".repeat(unit.star) : "");
const percent = (share) => `${Math.round(share * 100)}%`;
const ordinal = (n) => n + (n % 100 > 10 && n % 100 < 14 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
const compLine = (comp) => `${comp.name}  ·  avg place ${comp.avg_place}  ·  top 4 ${percent(comp.top4)}  ·  ` +
                           `played ${percent(comp.play_rate)}  ·  ${comp.strategy}, level ${comp.level}`;

/** One unit or item as a tile: its icon when the data has one, its name, stars, and the items it holds. */
function tile(piece, corner = "") {
  if (!piece) return '<div class="tile empty"></div>';
  const held = (piece.items ?? []).map((item) => (item.icon
    ? `<img src="${esc(item.icon)}" alt="${esc(item.name)}" title="${esc(item.name)}">`
    : `<span title="${esc(item.name)}">${esc(item.name.slice(0, 3))}</span>`)).join("");
  return `<div class="tile ${piece.cost ? `cost-${piece.cost}` : ""}" title="${esc(piece.name)}">` +
         (piece.icon ? `<img src="${esc(piece.icon)}" alt="">` : "") +
         (piece.star > 1 ? span("★".repeat(piece.star), "stars") : "") + (corner ? span(corner, "corner") : "") +
         span(piece.name, "name") + (held ? `<div class="held">${held}</div>` : "") + "</div>";
}

/** Tiles for numbered cells: empty ones stay visible, and pieces outside the range are added at the end. */
function cells(pieces, count) {
  const byCell = new Map(pieces.filter((p) => p.cell >= 1 && p.cell <= count).map((p) => [p.cell, p]));
  const placed = Array.from({ length: count }, (_, i) => tile(byCell.get(i + 1)));
  return [placed, pieces.filter((p) => !byCell.has(p.cell) || byCell.get(p.cell) !== p).map((p) => tile(p))];
}

function fill(id, html) {
  const element = document.getElementById(id);
  if (element.innerHTML !== html) element.innerHTML = html;
}

function show(name) {
  for (const view of document.querySelectorAll(".view")) view.hidden = view.id !== name;
  for (const button of document.querySelectorAll("#nav button")) button.classList.toggle("active", button.dataset.view === name);
}

function savePrefs() {
  localStorage.setItem(PREFS, JSON.stringify(prefs));
}

/** The overlay hotkey as text, like "Ctrl+Shift+T", everywhere the page names it. */
function renderHotkey() {
  const { keyCode, modifiers } = prefs.hotkey;
  const text = [modifiers.ctrl && "Ctrl", modifiers.alt && "Alt", modifiers.shift && "Shift", keyCode.replace(/^(Key|Digit)/, "")]
    .filter(Boolean).join("+");
  for (const element of document.querySelectorAll(".hotkey")) element.textContent = text;
}

function renderHome() {
  fill("connection", esc(problem || (live ? `In a game · stage ${session.stage}` : "No game running")));
  fill("home-game", problem ? span(problem, "warn")
    : live ? esc(`You are in a game (stage ${session.stage}). The Live game view follows it.`)
      : esc("Start a Teamfight Tactics match and the Live game view fills in on its own."));

  const last = JSON.parse(localStorage.getItem(LAST_GAME) ?? "null");
  fill("home-last", last
    ? span(last.rank ? `Finished ${ordinal(last.rank)}` : "Placement not recorded", "bold") +
      esc(`  ·  reached stage ${last.stage} at level ${last.level}  ·  ${new Date(last.date).toLocaleDateString()}\n`) +
      (last.comp ? span("Closest comp   ", "muted") + esc(last.comp) + "\n" : "") +
      span("Final board    ", "muted") + esc(last.board.map(stars).join(", ") || "not recorded")
    : span("No games yet. Play a match with TFT Coach open and it will show up here.", "muted"));

  const meta = data.meta;
  fill("home-comps", meta ? meta.comps.slice(0, HOME_COMPS).map((comp, i) => esc(`${i + 1}. ${compLine(comp)}`)).join("\n")
    : span("The meta couldn't be downloaded and there is no saved copy. Check your connection, then reopen the app.", "warn"));
  fill("home-meta", meta ? esc(`Set ${meta.set}  ·  ${meta.platform.toUpperCase()} Challenger  ·  ${meta.matches} matches, ` +
                               `${meta.comps.length} comps  ·  built ${meta.built} UTC`) : "");
}

/** The restart button for a downloaded update. Not offered during a game: restarting would lose it. */
function renderUpdate() {
  updateButton.hidden = !update;
  if (!update) return;
  updateButton.textContent = update.version ? `Restart to update to ${update.version}` : "Restart to update the game events";
  updateButton.disabled = live;
  updateButton.title = live ? "Available once your game is over. The update also installs when you close TFT Coach." : "";
}

function renderComps() {
  const row = (comp, front) => comp.units.filter((u) => u.front === front)
    .map((u) => `${u.name} (${u.cost}g, ${percent(u.freq)})`).join(", ") || "-";
  fill("comps-list", (data.meta?.comps ?? []).map((comp, i) => {
    const [holders, components] = comps.itemPlan(comp);
    const lines = [
      span("Traits       ", "muted") + esc(Object.entries(comp.traits).map(([t, n]) => `${n} ${t}`).join(", ")),
      span("Front row    ", "muted") + esc(row(comp, true)),
      span("Back row     ", "muted") + esc(row(comp, false)),
      ...holders.map(([role, name, items]) => span(`${role} items  `.padEnd(13), "muted") + esc(`${name}: ${items.join(", ")}`)),
      components.length ? span("Components   ", "muted") + esc(components.map(([c, k]) => (k === 1 ? c : `${k}× ${c}`)).join(", ")) : "",
      comp.early?.length ? span("Early game   ", "muted") + esc(comp.early.map((u) => u.name).join(", ")) : "",
    ];
    return `<details><summary>${esc(`${i + 1}. ${compLine(comp)}`)}</summary><div>${lines.filter(Boolean).join("\n")}</div></details>`;
  }).join("") || span("No meta data yet.", "muted"));
}

function options() {
  const form = new FormData(controls);
  return { lock: form.has("lock"), extraSlots: Number(form.get("extraSlots")) };
}

function renderLive() {
  const view = data.set ? session.view(options())
    : { waiting: "The game data couldn't be downloaded. Check your connection, then reopen the app." };
  if (!live && !view.waiting && prefs.autoLive) show("live");
  if (!overlay && live !== !view.waiting) window.game.setLive(!view.waiting); // main.js shows the overlay during a match
  live = !view.waiting;
  if (view.waiting) {
    fill("status", esc(view.waiting));
    fill("note", esc(problem));
    for (const id of ["econ", "board", "bench", "own-shop", "own-items", "plan", "shop", "items", "matches"]) fill(id, "");
    return;
  }
  fill("status", esc(view.status));
  fill("note", esc(view.note));
  fill("econ", view.econ.map((fact) => span(fact.label, "label") + esc(fact.text)).join("\n"));
  const [hexes, unplaced] = cells(view.board, BOARD_ROWS * BOARD_COLUMNS);
  fill("board", Array.from({ length: BOARD_ROWS }, (_, row) =>
    `<div class="row${row % 2 ? " offset" : ""}">${hexes.slice(row * BOARD_COLUMNS, (row + 1) * BOARD_COLUMNS).join("")}</div>`).join("") +
    (unplaced.length ? `<div class="strip">${unplaced.join("")}</div>` : ""));
  fill("bench", cells(view.bench, BENCH_SLOTS).flat().join(""));
  fill("own-shop", view.shop.map((slot) => tile(slot, slot ? `${slot.cost}g` : "")).join(""));
  fill("own-items", view.itemBench.map((item) => tile(item, item.count > 1 ? `×${item.count}` : "")).join("") ||
       span("No spare items.", "muted"));

  const held = (name) => view.taken[name.split("*")[0]] ?? 0;
  const unit = (u) => {
    const cls = u.where === "board" ? "owned" : u.where === "bench" ? "bench" : u.where ? "shop" : "muted";
    const place = { board: "", bench: "on your bench" }[u.where] ?? (u.where ? `in ${u.where}` : "");
    const notes = [u.placeholder ? "early stand-in" : "", place, held(u.name) ? `${held(u.name)} opp.` : ""].filter(Boolean);
    return span(u.name, cls) + (notes.length ? span(` (${notes.join(", ")})`, "muted") : "");
  };
  fill("plan", view.target
    ? span(`${view.target}: its usual board at your level. Bright = on your board.\n`, "muted") +
      [["Front   ", view.front], ["Back    ", view.back]]
        .map(([label, row]) => span(label, "muted") + (row.map(unit).join(span(",  ", "muted")) || span("-", "muted"))).join("\n")
    : span("No comp to compare with yet.", "muted"));

  fill("shop", view.inShop.map(({ name, slot, copies }) => {
    const notes = [`slot ${slot}`, ...(copies ? [`you hold ${copies}`] : []), ...(held(name) ? [`${held(name)} opp. field it`] : [])];
    return span(name, "shop") + span(` (${notes.join(", ")})`, "muted");
  }).join("\n") || span("None in this shop.", "muted"));

  let html = view.items.map(([role, name, items]) => span(`${role} ${name}\n`, "bold") + esc("  " + items.join(", "))).join("\n");
  if (view.components.length) {
    html += "\n" + span("Built from\n", "bold") +
            esc("  " + view.components.map(([c, k]) => (k === 1 ? c : `${k}× ${c}`)).join(", "));
  }
  fill("items", html);

  fill("matches", view.comps.map((line, i) => span(line, i ? "muted" : "")).join("\n") + "\n" +
       span("Opponents seen: " + (view.scouted.join(", ") || "none yet (recorded as you fight them)"), "muted"));
}

/** Keeps the summary of the current game for the home screen, updated as the game goes on. */
function remember() {
  if (!session.stage || session.level === null) return;
  const key = [session.game, session.stage, session.over, session.rank].join("|");
  if (key === remembered) return;
  remembered = key;
  const previous = JSON.parse(localStorage.getItem(LAST_GAME) ?? "null");
  const summary = session.summary();
  if (!summary.board.length && previous?.game === session.game) summary.board = previous.board; // cleared when the game ends
  localStorage.setItem(LAST_GAME, JSON.stringify({ ...summary, game: session.game, date: new Date().toISOString() }));
}

function render() {
  renderLive();
  if (!overlay) remember();
  renderHome();
  renderUpdate();
}

function resetControls() {
  controls.elements.lock.checked = false;
  controls.elements.extraSlots.value = "0";
}

window.game.onInfo((info) => {
  const game = session.game;
  session.applyInfo(info); // a value can arrive twice: as an update, and in the state sent on "ready"
  if (session.game !== game) resetControls(); // new game: clear per-game ticks
  render();
});
window.game.onEvent((name) => {
  if (name !== "match_start") return;
  session.reset();
  resetControls();
  render();
});
window.game.onProblem((text) => {
  problem = text;
  render();
});
window.game.onUpdate((found) => {
  update = found;
  renderUpdate();
});
updateButton.addEventListener("click", () => window.game.restart());
controls.addEventListener("change", render);

document.getElementById("nav").addEventListener("click", (event) => {
  if (event.target.dataset.view) show(event.target.dataset.view);
});
for (const name of ["onTop", "autoLive", "overlay"]) prefsForm.elements[name].checked = prefs[name];
prefsForm.addEventListener("change", () => {
  for (const name of ["onTop", "autoLive", "overlay"]) prefs[name] = prefsForm.elements[name].checked;
  savePrefs();
  window.game.setOnTop(prefs.onTop);
  window.game.setOverlay(prefs.overlay);
});
hotkeyButton.addEventListener("click", () => {
  hotkeyButton.disabled = true;
  hotkeyButton.textContent = "Press the new keys (Esc cancels)";
  const capture = (event) => {
    event.preventDefault();
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return; // still choosing: wait for the key itself
    window.removeEventListener("keydown", capture, true);
    // A plain key would be taken away from the game, so it needs Ctrl or Alt, unless it is a function key.
    if (HOTKEY_KEYS.test(event.code) && (event.ctrlKey || event.altKey || /^F\d/.test(event.code))) {
      prefs.hotkey = { keyCode: event.code, modifiers: { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey } };
      savePrefs();
      window.game.setHotkey(prefs.hotkey);
    }
    hotkeyButton.disabled = false;
    renderHotkey();
  };
  window.addEventListener("keydown", capture, true);
});
// The app window and the overlay share the saved settings: the overlay names the new hotkey as soon as it changes.
window.addEventListener("storage", (event) => {
  if (event.key !== PREFS) return;
  Object.assign(prefs, JSON.parse(event.newValue ?? "{}"));
  renderHotkey();
});
document.getElementById("show-welcome").addEventListener("click", () => welcome.showModal());
document.getElementById("manage-privacy").addEventListener("click", () => window.game.privacySettings());
document.getElementById("manage-consent").addEventListener("click", () => window.game.privacySettings("purposes"));
document.getElementById("vendors").addEventListener("click", (event) => {
  event.preventDefault();
  window.game.privacySettings("vendors");
});
for (const link of document.querySelectorAll("[data-link]")) link.addEventListener("click", () => window.game.open(link.dataset.link));
welcome.addEventListener("close", () => {
  prefs.welcomed = true;
  savePrefs();
});

fill("about", esc(`TFT Coach ${await window.game.version()}\n\n` +
  "Meta comps are computed from recent Challenger matches through the Riot Games API; names come from CommunityDragon. " +
  "The live view reads your game through Overwolf's game events and only displays information: it never plays for you. " +
  "No augment data is collected or shown.\n\n" +
  "TFT Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially " +
  "involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or " +
  "registered trademarks of Riot Games, Inc."));
renderComps();
render();
if (overlay) {
  document.body.classList.add("overlay");
  show("live");
} else {
  window.game.setOnTop(prefs.onTop);
  window.game.setOverlay(prefs.overlay);
  window.game.setHotkey(prefs.hotkey);
}
renderHotkey();
// Where the law asks for consent, the welcome guide also explains what Overwolf stores and how to choose.
document.getElementById("consent").hidden = !(await window.game.consentNeeded());
if (!overlay && !prefs.welcomed) welcome.showModal();
window.game.ready();

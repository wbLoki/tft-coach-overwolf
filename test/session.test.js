import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";

import { Session } from "../src/session.js";
import { setData } from "../src/store.js";

const unit = (name, cost, freq, front) => ({ name, cost, freq, front, three_star_rate: 0, item_avg: front ? 1 : 2,
                                             items: front ? [] : ["Guinsoo's Rageblade"] });
setData({
  set: JSON.parse(readFileSync(new URL("./fixtures/set_data.json", import.meta.url))),
  static: {
    set: 18,
    units: {
      DA_18_Varus: { name: "Varus", cost: 1, traits: ["Inferno", "Rapidfire"] },
      DA_18_KogMaw: { name: "Kog'Maw", cost: 2, traits: ["Inferno"] },
      DA_18_Shen: { name: "Shen", cost: 1, traits: ["Defender"] },
      DA_18_Zyra: { name: "Zyra", cost: 4, traits: ["Summoner"] },
      DA_18_Sentry: { name: "Sentry", cost: 1, traits: [] },
    },
    traits: { DA_18_Inferno: "Inferno", DA_18_Rapidfire: "Rapidfire", DA_18_Defender: "Defender", DA_18_Summoner: "Summoner" },
    items: { DA_GuinsoosRageblade: "Guinsoo's Rageblade", DA_18_EmblemInferno: "Inferno Emblem", DA_Reforger: "Reforger" },
    recipes: { "Guinsoo's Rageblade": ["Recurve Bow", "Needlessly Large Rod"] },
    icons: { DA_18_Varus: "ASSETS/Characters/Varus/Varus_Square.tex", DA_GuinsoosRageblade: "assets/items/guinsoo.tex" },
  },
  meta: { comps: [
    { name: "Inferno + Rapidfire", avg_place: 4.2, top4: 0.5, level: 8, strategy: "reroll1",
      traits: { Inferno: 2, Rapidfire: 1, Defender: 1 }, early: [],
      units: [unit("Varus", 1, 1.0, false), unit("Kog'Maw", 2, 0.9, false), unit("Shen", 1, 0.8, true)] },
    { name: "Summoner + Defender", avg_place: 4.0, top4: 0.55, level: 8, strategy: "standard",
      traits: { Summoner: 1, Defender: 1 }, early: [], units: [unit("Zyra", 4, 1.0, false)] },
  ] },
});

// Updates in the shape overwolf.games.events.onInfoUpdates2 delivers them: values are strings.
const cells = (...units) => JSON.stringify(Object.fromEntries(units.map(([name, level = 1, item = ""], i) =>
  [`cell_${i + 1}`, { name, level: String(level), item_1: item, item_2: "", item_3: "" }])));
const round = (stage, type = "PVP") => ({ match_info: { round_type: JSON.stringify({ stage, name: "x", type }) } });

let s;
beforeEach(() => {
  s = new Session();
  s.applyInfo({ me: { summoner_name: "Me", gold: "23", health: "80", xp: '{"level":4,"current_xp":2,"xp_max":10}' } });
  s.applyInfo(round("2-5"));
});

test("waits until a game is seen", () => {
  assert.deepEqual(new Session().view(), { waiting: "Waiting for a TFT game..." });
  s.applyInfo({ match_info: { match_state: '{"in_progress":false}' } });
  assert.ok(s.view().waiting);
});

test("reads state, board, bench and shop", () => {
  s.applyInfo({ board: { board_pieces: cells(["DA_18_Varus", 2, "DA_GuinsoosRageblade"], ["DA_18_Sentry"]) } });
  s.applyInfo({ bench: { bench_pieces: cells(["DA_18_Varus"], ["DA_18_Zyra"]) } });
  s.applyInfo({ store: { shop_pieces: '{"slot_1":{"name":"da_18_kogmaw"},"slot_2":{"name":"Sold"},"slot_3":{"name":"DA_18_Zyra"}}' } });
  const view = s.view();
  assert.equal(view.status, "Stage 2-5   ·   Level 4 (2 xp)   ·   23 gold   ·   80 HP");
  assert.deepEqual(view.econ.map((f) => f.label), ["Interest", "Income", "Level", "Shop odds"]);
  const assets = "https://raw.communitydragon.org/latest/game/assets/";
  assert.deepEqual(view.board, [{ name: "Varus", cost: 1, star: 2, cell: 1, icon: assets + "characters/varus/varus_square.png",
                                  items: [{ name: "Guinsoo's Rageblade", icon: assets + "items/guinsoo.png" }] }]); // the summon isn't a unit
  assert.deepEqual(view.bench.map((u) => [u.name, u.cell, u.icon]), [["Varus", 1, assets + "characters/varus/varus_square.png"], ["Zyra", 2, null]]);
  assert.deepEqual(view.shop, [{ name: "Kog'Maw", cost: 2, icon: null }, null, { name: "Zyra", cost: 4, icon: null }, null, null]);
  assert.equal(view.target, "Inferno + Rapidfire");
  assert.deepEqual(view.front, [{ name: "Shen", placeholder: false, where: null }]);
  assert.deepEqual(view.back, [{ name: "Varus", placeholder: false, where: "board" },
                               { name: "Kog'Maw", placeholder: false, where: "shop 1" }]);
  assert.deepEqual(view.inShop, [{ name: "Kog'Maw", slot: 1, copies: 0 }]);
  assert.deepEqual(view.items, [["Carry", "Varus", ["Guinsoo's Rageblade"]]]);
  assert.deepEqual(view.components, [["Recurve Bow", 1], ["Needlessly Large Rod", 1]]);
});

test("emblems: equipped ones count as traits, spare ones come from your item bench", () => {
  s.applyInfo({ board: { board_pieces: cells(["DA_18_Zyra", 1, "DA_18_EmblemInferno"]) } });
  assert.equal(s.view().target, "Summoner + Defender");
  s.applyInfo({ bench: { item_bench: JSON.stringify([
    { summoner: "Other", bench_items: [{ name: "DA_18_EmblemInferno", count: 3 }] },
    { summoner: "Me", bench_items: [{ name: "DA_Reforger", count: 2 }, { name: "DA_18_EmblemInferno", count: 1 }] },
  ]) } });
  assert.deepEqual(s.emblems, ["Inferno"]);
  assert.deepEqual(s.view().itemBench, [{ name: "Reforger", icon: null, count: 2 }, { name: "Inferno Emblem", icon: null, count: 1 }]);
  assert.equal(s.view().target, "Inferno + Rapidfire");
  assert.equal(s.view().note, "Spare emblems counted: Inferno.");
});

test("the board you fight is scouted under the opponent's name", () => {
  s.applyInfo({ board: { opponent_board_pieces: cells(["DA_18_Varus"], ["DA_18_KogMaw"], ["DA_18_Shen"]) } });
  assert.deepEqual(s.scouted, {}); // name not known yet
  s.applyInfo({ match_info: { opponent: '{"name":"Rival","tag_line":"EUW"}' } });
  assert.deepEqual(s.scouted.Rival.units, ["Varus", "Kog'Maw", "Shen"]);
  const view = s.view();
  assert.deepEqual(view.scouted, ["Rival (2-5)"]);
  assert.deepEqual(view.taken, { Varus: 1, "Kog'Maw": 1, Shen: 1 });
  assert.match(view.comps.find((line) => line.includes("Inferno + Rapidfire")), /also played by Rival/);
  s.applyInfo(round("2-6"));
  s.applyInfo({ board: { opponent_board_pieces: cells(["DA_18_Zyra"]) } });
  assert.deepEqual(Object.keys(s.scouted), ["Rival"]); // next fight: not filed under the last opponent
});

test("streak follows your PVP results", () => {
  const outcome = (result) => ({ match_info: { round_outcome: JSON.stringify({ Me: { outcome: result }, Rival: { outcome: "victory" } }) } });
  s.applyInfo(outcome("defeat"));
  s.applyInfo(outcome("defeat")); // delivered twice: counted once
  assert.equal(s.streak, -1);
  s.applyInfo(round("2-6"));
  s.applyInfo(outcome("defeat"));
  assert.equal(s.streak, -2);
  s.applyInfo(round("2-7"));
  s.applyInfo(outcome("victory"));
  assert.equal(s.streak, 1);
  s.applyInfo(round("3-1", "PVE"));
  s.applyInfo(outcome("victory"));
  assert.equal(s.streak, 1);
});

test("a new game clears what was remembered, lock included", () => {
  s.applyInfo({ match_info: { opponent: '{"name":"Rival"}' }, board: { opponent_board_pieces: cells(["DA_18_Zyra"]) } });
  assert.equal(s.view({ lock: true }).target, s.locked);
  const game = s.game;
  s.applyInfo(round("1-1", "PVE"));
  assert.equal(s.game, game + 1);
  assert.deepEqual(s.scouted, {});
  assert.equal(s.target, null);
  assert.equal(s.locked, null);
});

test("summary keeps what the last-game card shows", () => {
  s.applyInfo({ board: { board_pieces: cells(["DA_18_Varus", 2]) }, me: { rank: "3" } });
  s.view();
  assert.deepEqual(s.summary(), { stage: "2-5", level: 4, rank: 3, comp: "Inferno + Rapidfire",
                                  board: [{ name: "Varus", star: 2 }] });
});

/** Per-game state, fed by Overwolf's TFT game events, and the view the window shows. */
import * as comps from "./comps.js";
import { facts, parseStage, stageReached } from "./econ.js";
import { data, emblemTrait, icon, itemName, unit } from "./store.js";

const SHOWN_COMPS = 3;
const COPIES = { 1: 1, 2: 3, 3: 9 }; // copies of a unit merged into each star level

/** Info values arrive as strings, objects among them as JSON. */
function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Playable units out of a board or bench payload ({cell_1: {name, level, item_1..3}, ...}), with what they hold. */
function pieces(cells) {
  return Object.entries(cells ?? {}).flatMap(([cell, piece]) => {
    const u = unit(piece?.name);
    if (!u) return [];
    const items = [piece.item_1, piece.item_2, piece.item_3].filter(Boolean);
    return [{ name: u.name, cost: u.cost, traits: u.traits, star: Number(piece.level) || 1, cell: Number(cell.split("_")[1]),
              icon: icon(piece.name), items: items.map((api) => ({ name: itemName(api), icon: icon(api) })),
              emblems: items.map(emblemTrait).filter(Boolean) }];
  });
}

/** What the window draws for a piece. */
const tile = ({ name, cost, star, cell, icon: picture, items }) => ({ name, cost, star, cell, icon: picture, items });

export class Session {
  constructor() {
    this.game = 0; // goes up each time a new game is detected
    this.me = null; // summoner name
    this.stage = null;
    this.roundType = null;
    this.level = null;
    this.xp = 0;
    this.gold = null;
    this.hp = 100;
    this.board = [];
    this.bench = [];
    this.shop = []; // per slot: {name, cost, icon}, or null when empty or sold
    this.items = []; // your item bench: {name, icon, count}
    this.emblems = []; // traits of the emblems on your item bench
    this.over = false;
    this.reset();
  }

  /** Forgets what was remembered about the game. Gold, level, board and so on are overwritten by the next events. */
  reset() {
    this.game += 1;
    this.seenStage = [0, 0];
    this.streak = 0; // positive = win streak, negative = loss streak
    this.outcomeStage = null; // stage of the last result counted: the same result can be delivered twice
    this.opponent = null;
    this.unclaimed = null; // opponent board that arrived before the opponent's name
    this.scouted = {}; // player -> {stage seen, traits, units}
    this.locked = null;
    this.target = null; // name of the comp the live view is following
    this.rank = null; // final placement, known once you are out
  }

  /** Takes an info update or a getInfo result: {category: {key: value}}. */
  applyInfo(info) {
    for (const values of Object.values(info ?? {})) {
      if (!values || typeof values !== "object") continue;
      for (const [key, raw] of Object.entries(values)) this.set(key, parse(raw));
    }
  }

  set(key, value) {
    switch (key) {
      case "summoner_name":
        this.me = String(value);
        break;
      case "gold":
        this.gold = Number(value);
        break;
      case "health":
        this.hp = Number(value);
        break;
      case "rank":
        this.rank = Number(value);
        break;
      case "xp":
        this.level = value.level;
        this.xp = value.current_xp;
        break;
      case "match_state":
        this.over = value.in_progress === false;
        break;
      case "round_type": {
        const stage = parseStage(value.stage);
        if (stage[0] === 1 && stageReached(this.seenStage, [2, 1])) this.reset(); // new game
        this.seenStage = stage;
        this.stage = value.stage;
        this.roundType = value.type;
        this.opponent = this.unclaimed = null;
        break;
      }
      case "board_pieces":
        this.board = pieces(value);
        break;
      case "bench_pieces":
        this.bench = pieces(value);
        break;
      case "shop_pieces":
        this.shop = [1, 2, 3, 4, 5].map((slot) => {
          const api = value[`slot_${slot}`]?.name;
          const u = unit(api);
          return u ? { name: u.name, cost: u.cost, icon: icon(api) } : null;
        });
        break;
      case "item_bench": {
        const mine = Array.isArray(value) ? value.find((entry) => entry.summoner === this.me) : null;
        if (mine) {
          this.items = mine.bench_items.map((item) => ({ name: itemName(item.name), icon: icon(item.name), count: item.count ?? 1 }));
          this.emblems = mine.bench_items.flatMap((item) => Array(item.count ?? 1).fill(emblemTrait(item.name)))
            .filter(Boolean);
        }
        break;
      }
      case "opponent":
        this.opponent = value.name;
        if (this.unclaimed) this.scout(this.unclaimed);
        break;
      case "opponent_board_pieces":
        this.scout(pieces(value));
        break;
      case "round_outcome": {
        const outcome = value?.[this.me]?.outcome;
        if (this.roundType !== "PVP" || this.outcomeStage === this.stage) break; // minion rounds don't touch streaks
        if (outcome === "victory" || outcome === "defeat") this.outcomeStage = this.stage;
        if (outcome === "victory") this.streak = Math.max(this.streak, 0) + 1;
        else if (outcome === "defeat") this.streak = Math.min(this.streak, 0) - 1;
        break;
      }
    }
  }

  /** Records the board you are fighting under its owner's name, once both are known. */
  scout(units) {
    if (!units.length) return;
    if (!this.opponent) {
      this.unclaimed = units;
      return;
    }
    this.unclaimed = null;
    this.scouted[this.opponent] = { stage: this.stage, traits: comps.traitsOf(units),
                                    units: [...new Set(units.map((u) => u.name))] };
  }

  /** What is worth remembering of the game once it is over. */
  summary() {
    return { stage: this.stage, level: this.level, rank: this.rank, comp: this.target,
             board: this.board.map(({ name, star }) => ({ name, star })) };
  }

  /**
   * Everything the live view shows, as an object of sections. It describes the game and the meta;
   * it never tells the player what to do (see facts() in econ.js).
   *
   * `extraSlots` is board space beyond your level (Tactician's Cape/Crown, augments).
   */
  view({ lock = false, extraSlots = 0 } = {}) {
    if (this.over || !this.stage || this.level === null || this.gold === null) {
      return { waiting: "Waiting for a TFT game..." };
    }
    const meta = data.meta;
    const taken = {}; // unit -> opponents fielding it
    for (const seen of Object.values(this.scouted)) {
      for (const name of seen.units) taken[name] = (taken[name] ?? 0) + 1;
    }
    let contenders = {};
    let ranked = [];
    if (meta) {
      const scouted = Object.fromEntries(Object.entries(this.scouted).map(([player, seen]) => [player, seen.traits]));
      contenders = comps.findContenders(meta, scouted);
      ranked = comps.rank(meta, comps.traitsOf(this.board), { contenders, emblems: this.emblems, taken });
    }
    if (lock && ranked.length) {
      this.locked ??= ranked[0].comp.name;
      ranked.sort((a, b) => (a.comp.name !== this.locked) - (b.comp.name !== this.locked)); // stable: locked comp first
    } else {
      this.locked = null;
    }

    const size = Math.max(this.level + extraSlots, this.board.length);
    const copies = {}; // unit -> copies you hold, counting the ones merged into stars
    for (const u of [...this.board, ...this.bench]) copies[u.name] = (copies[u.name] ?? 0) + (COPIES[u.star] ?? 1);
    const view = {
      status: `Stage ${this.stage}   ·   Level ${this.level} (${this.xp} xp)   ·   ${this.gold} gold   ·   ` +
              `${this.hp} HP` + (size !== this.level ? `   ·   ${size} board slots` : ""),
      note: this.emblems.length ? `Spare emblems counted: ${this.emblems.join(", ")}.` : "",
      econ: facts({ level: this.level, xp: this.xp, gold: this.gold, streak: this.streak }),
      board: this.board.map(tile),
      bench: this.bench.map(tile),
      shop: this.shop,
      itemBench: this.items,
      front: [], back: [], inShop: [], items: [], components: [], comps: [],
      scouted: Object.entries(this.scouted).map(([player, seen]) => `${player} (${seen.stage})`),
      taken,
    };
    if (!ranked.length) {
      view.comps = ["No meta data: the download failed and there is no saved copy."];
      return view;
    }

    // The comp closest to your board, and where each unit of its usual board at your level currently is.
    const target = ranked[0].comp;
    const where = new Map(this.board.map((u) => [u.name, "board"]));
    for (const u of this.bench) if (!where.has(u.name)) where.set(u.name, "bench");
    const shopNames = this.shop.map((slot) => slot?.name ?? null);
    shopNames.forEach((name, i) => {
      if (name && !where.has(name)) where.set(name, `shop ${i + 1}`);
    });
    const [real, fill] = comps.boardUnits(target, this.level, size);
    const row = (front) => [...real.map((u) => [u, false]), ...fill.map((u) => [u, true])]
      .filter(([u]) => u.front === front)
      .map(([u, placeholder]) => ({ name: u.name, placeholder, where: where.get(u.name) ?? null }));
    view.front = row(true);
    view.back = row(false);
    view.inShop = comps.shopPicks(shopNames, target, this.level, size)
      .map(([slot, name]) => ({ name, slot, copies: copies[name.split("*")[0]] ?? 0 }));
    [view.items, view.components] = comps.itemPlan(target);
    view.target = this.target = target.name;
    const percent = (share) => `${Math.round(share * 100)}%`;
    view.comps = ranked.slice(0, SHOWN_COMPS).map(({ fit, comp }, i) => {
      const rivals = contenders[comp.name];
      const held = comps.unitContest(comp, taken);
      return `${i + 1}. ${comp.name}  ·  avg place ${comp.avg_place}  ·  top 4 ${percent(comp.top4)}  ·  ` +
             `fit ${percent(fit)}  ·  ${comp.strategy}, level ${comp.level}` +
             (rivals ? `  ·  also played by ${rivals.join(", ")}` : "") +
             (held ? `  ·  its units seen on opponents ${held}×` : "");
    });
    return view;
  }
}

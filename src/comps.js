/** Matches your board, bench and shop against the meta comps in meta.json. */
import { data } from "./store.js";

const PLACEMENT_WEIGHT = 0.05; // how much a comp's average placement counts against trait fit
const CONTEST_PENALTY = 0.1; // per opponent already on the comp
const UNIT_CONTEST_PENALTY = 0.02; // per opponent board holding one of the comp's core units
const UNIT_CONTEST_CAP = 0.2;
export const EMBLEM_BONUS_MAIN = 0.25; // spare emblem for one of the comp's two defining traits
export const EMBLEM_BONUS_SIDE = 0.1; // spare emblem for another trait the comp uses
const BUY_MIN_FREQ = 0.4; // a comp's core units: the ones it fields at least this often
const CONTENDER_MIN_FIT = 0.4; // below this an opponent's board doesn't point at any comp yet

const sum = (numbers) => numbers.reduce((a, b) => a + b, 0);

/** Active trait counts of a set of pieces ({name, traits, emblems}): copies of a unit count once. */
export function traitsOf(pieces) {
  const traits = {};
  const seen = new Set();
  for (const p of pieces) {
    for (const t of seen.has(p.name) ? p.emblems : [...p.traits, ...p.emblems]) traits[t] = (traits[t] ?? 0) + 1;
    seen.add(p.name);
  }
  return traits;
}

/** Your traits with +1 for each emblem you hold but haven't equipped yet. */
export function withEmblems(traits, emblems) {
  const out = { ...traits };
  for (const emblem of emblems) out[emblem] = (out[emblem] ?? 0) + 1;
  return out;
}

/**
 * How well your traits and the comp's overlap (0..1).
 * Average of: share of your trait units that the comp uses, and share of the comp you already fill.
 */
export function fit(comp, traits) {
  const need = sum(Object.values(comp.traits));
  const mine = sum(Object.values(traits));
  const have = sum(Object.entries(comp.traits).map(([name, count]) => Math.min(count, traits[name] ?? 0)));
  return need && mine ? (have / need + have / mine) / 2 : 0;
}

/** Ranking bonus for spare emblems: an emblem fits any unit, so it is worth more than one unit of the trait. */
export function emblemBonus(comp, emblems) {
  const main = comp.name.split(" + ");
  let bonus = 0;
  for (const emblem of emblems) {
    if (main.includes(emblem)) bonus += EMBLEM_BONUS_MAIN;
    else if (emblem in comp.traits) bonus += EMBLEM_BONUS_SIDE;
  }
  return bonus;
}

/** How many opponent boards hold the comp's core units, added up over those units. */
export function unitContest(comp, taken) {
  return sum(comp.units.filter((u) => (u.freq ?? 1) >= BUY_MIN_FREQ).map((u) => taken[u.name] ?? 0));
}

/**
 * Comps sorted best first, as {fit, comp}.
 *
 * `contenders` maps comp name -> opponents playing it. `emblems` are spare emblems you hold: they count
 * as +1 of their trait and add a bonus to comps built on it. `taken` maps unit name -> how many
 * opponents field it: comps whose core units are drained from the shared pool rank lower.
 */
export function rank(meta, traits, { contenders = {}, emblems = [], taken = {} } = {}) {
  traits = withEmblems(traits, emblems);
  const score = ({ fit: f, comp }) => f + (4.5 - comp.avg_place) * PLACEMENT_WEIGHT + emblemBonus(comp, emblems)
    - (contenders[comp.name]?.length ?? 0) * CONTEST_PENALTY
    - Math.min(unitContest(comp, taken) * UNIT_CONTEST_PENALTY, UNIT_CONTEST_CAP);
  return meta.comps.map((comp) => ({ fit: fit(comp, traits), comp })).sort((a, b) => score(b) - score(a));
}

/** Comp name -> opponents whose scouted traits point at that comp. `scouted` maps player -> traits. */
export function findContenders(meta, scouted) {
  const out = {};
  for (const [player, traits] of Object.entries(scouted)) {
    const best = rank(meta, traits)[0];
    if (best && best.fit >= CONTENDER_MIN_FIT) (out[best.comp.name] ??= []).push(player);
  }
  return out;
}

/** Highest unit cost you can realistically field at this level. */
export function maxCost(level) {
  return level <= 4 ? 2 : level <= 6 ? 3 : level === 7 ? 4 : 5;
}

/**
 * Estimated [final-board units, placeholders] to field at this level.
 *
 * `size` is how many units you can field: your level, plus any extra slots from Tactician's Cape/Crown
 * or augments. Match data only has final boards, so below the comp's usual level this is the final
 * units you can afford yet, topped up with cheap units sharing its traits.
 */
export function boardUnits(comp, level, size = level) {
  const final = comp.units.slice(0, Math.max(size, comp.level)); // units are sorted most common first
  if (level >= comp.level) return [final.slice(0, size), []];
  const real = final.filter((u) => u.cost <= maxCost(level))
    .sort((a, b) => a.cost - b.cost || b.freq - a.freq).slice(0, size);
  const fill = (comp.early ?? []).filter((u) => u.cost <= maxCost(level)).slice(0, size - real.length);
  return [real, fill];
}

/** [['Carry', unit], ['Tank', unit]]: the most itemised back-row and front-row unit. */
export function itemHolders(comp) {
  const out = [];
  for (const [label, front] of [["Carry", false], ["Tank", true]]) {
    const units = comp.units.filter((u) => u.front === front && u.items.length);
    if (units.length) out.push([label, units.reduce((best, u) => (u.item_avg > best.item_avg ? u : best))]);
  }
  return out;
}

/** [[[role, unit, items]], [[component, how many]]] for the comp's carry and main tank. */
export function itemPlan(comp) {
  const holders = itemHolders(comp).map(([label, u]) => [label, u.name, u.items]);
  const recipes = data.static?.recipes ?? {};
  const need = new Map(); // keyed in lower case: the data spells some components two ways ("of the" / "Of The")
  for (const [, , items] of holders) {
    for (const component of items.flatMap((item) => recipes[item] ?? [])) {
      const entry = need.get(component.toLowerCase()) ?? [component, 0];
      entry[1] += 1;
      need.set(component.toLowerCase(), entry);
    }
  }
  return [holders, [...need.values()].sort((a, b) => b[1] - a[1])];
}

/**
 * [slot number, label] for shop units that belong to the comp: its core units, plus the placeholders on
 * this level's board (labelled as such).
 */
export function shopPicks(shop, comp, level = 10, size) {
  const core = comp.units.filter((u) => (u.freq ?? 1) >= BUY_MIN_FREQ).map((u) => u.name);
  const fill = boardUnits(comp, level, size)[1].map((u) => u.name);
  const picks = [];
  shop.forEach((name, i) => {
    if (name && core.includes(name)) picks.push([i + 1, name]);
    else if (name && fill.includes(name)) picks.push([i + 1, `${name}* placeholder`]);
  });
  return picks;
}

const ASSETS = "https://raw.communitydragon.org/latest/game/";

/** Game data every module reads: set numbers (set_data.json), names and traits (static.json), meta comps (meta.json). */
export const data = { set: null, static: null, meta: null };

let unitsByApi = new Map();
let itemsByApi = new Map();
let traitNames = new Set();
let icons = new Map();

export function setData(parts) {
  Object.assign(data, parts);
  if (!parts.static) return;
  // Units of the current set that have traits: leaves out minions, summons and "(…)" variants.
  const playable = Object.entries(parts.static.units).filter(([, u]) => u.traits.length && !u.name.includes("("));
  unitsByApi = new Map(playable.map(([api, u]) => [api.toLowerCase(), u]));
  itemsByApi = new Map(Object.entries(parts.static.items).map(([api, name]) => [api.toLowerCase(), name]));
  traitNames = new Set(Object.values(parts.static.traits));
  icons = new Map(Object.entries(parts.static.icons ?? {}).map(([api, path]) => [api.toLowerCase(), path]));
}

/** The unit (name, cost, traits) behind a game id like 'DA_18_Varus', if it is a playable one. */
export function unit(api) {
  return (api && unitsByApi.get(String(api).toLowerCase())) || null;
}

/** Display name of an item id like 'DA_GuinsoosRageblade'; the id itself if it is unknown. */
export function itemName(api) {
  return itemsByApi.get(String(api).toLowerCase()) ?? String(api);
}

/** URL of the game's icon for a unit or item id, or null if the published data has none. */
export function icon(api) {
  const path = icons.get(String(api).toLowerCase());
  return path ? ASSETS + path.toLowerCase().replace(/\.(tex|dds)$/, ".png") : null;
}

/** The trait an emblem item grants, or null for any other item. */
export function emblemTrait(api) {
  const name = itemsByApi.get(String(api).toLowerCase()) ?? "";
  const trait = name.endsWith(" Emblem") ? name.slice(0, -" Emblem".length) : null;
  return traitNames.has(trait) ? trait : null;
}

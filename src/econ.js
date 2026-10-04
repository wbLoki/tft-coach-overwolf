/** Gold and XP maths. All set-specific numbers come from data/set_data.json. */
import { data } from "./store.js";

export function parseStage(stage) {
  const [a, b] = stage.split("-").map(Number);
  return [a, b];
}

/** True once `stage` is at or past `target`, both as [stage, round]. */
export function stageReached(stage, target) {
  return stage[0] > target[0] || (stage[0] === target[0] && stage[1] >= target[1]);
}

export function interest(gold) {
  return Math.min(Math.floor(gold / data.set.interest_per), data.set.interest_cap);
}

/** `streak` is the length of the current win OR loss streak. */
export function streakGold(streak) {
  for (const [length, bonus] of data.set.streak_gold) {
    if (Math.abs(streak) >= length) return bonus;
  }
  return 0;
}

/** Gold gained at the start of next round, excluding the +1 for a win. */
export function income(gold, streak = 0) {
  return data.set.base_income + interest(gold) + streakGold(streak);
}

/** Gold missing to reach the next interest breakpoint (0 if already capped). */
export function goldToNextInterest(gold) {
  if (interest(gold) >= data.set.interest_cap) return 0;
  return data.set.interest_per - (gold % data.set.interest_per);
}

/** Gold needed to reach the next level, or null at max level. */
export function costToLevel(level, xp) {
  if (level >= data.set.max_level) return null;
  const missing = data.set.xp_to_next_level[level] - xp;
  const buys = Math.ceil(Math.max(missing, 0) / data.set.xp_per_buy);
  return buys * data.set.xp_buy_cost;
}

/**
 * Your economy in numbers, as [{label, text}].
 *
 * Information only, never an instruction: Riot doesn't allow apps to tell players what to do
 * based on the current game state.
 */
export function facts({ level, xp, gold, streak = 0 }) {
  const set = data.set;
  const missing = goldToNextInterest(gold);
  const out = [
    { label: "Interest", text: missing ? `+${interest(gold)}g per round. Next breakpoint: ${gold + missing}g, ${missing}g away.`
                                       : `+${interest(gold)}g per round, the maximum.` },
    { label: "Income", text: `+${income(gold, streak)}g next round (base ${set.base_income}, interest ${interest(gold)}, ` +
                             `streak ${streakGold(streak)}).` },
  ];
  const cost = costToLevel(level, xp);
  if (cost !== null) {
    const tempo = set.level_tempo[level + 1];
    out.push({ label: "Level", text: `Level ${level + 1} costs ${cost}g.` + (tempo ? ` Common timing: stage ${tempo}.` : "") });
  }
  const odds = set.shop_odds[level].map((percent, i) => (percent ? `${i + 1}-cost ${percent}%` : null)).filter(Boolean);
  out.push({ label: "Shop odds", text: odds.join("  ·  ") });
  return out;
}

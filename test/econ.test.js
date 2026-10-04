import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as econ from "../src/econ.js";
import { setData } from "../src/store.js";

setData({ set: JSON.parse(readFileSync(new URL("./fixtures/set_data.json", import.meta.url))) });

const fact = (state, label) => econ.facts(state).find((f) => f.label === label)?.text;

test("interest", () => {
  assert.deepEqual([9, 10, 49, 50, 80].map(econ.interest), [0, 1, 4, 5, 5]);
});

test("gold to next interest", () => {
  assert.equal(econ.goldToNextInterest(48), 2);
  assert.equal(econ.goldToNextInterest(60), 0);
});

test("cost to level", () => {
  assert.equal(econ.costToLevel(7, 20), 28); // 28 xp missing -> 7 buys
  assert.equal(econ.costToLevel(7, 46), 4);
  assert.equal(econ.costToLevel(10, 0), null);
});

test("facts describe the economy", () => {
  const state = { level: 7, xp: 20, gold: 48, streak: -3 };
  assert.equal(fact(state, "Interest"), "+4g per round. Next breakpoint: 50g, 2g away.");
  assert.equal(fact(state, "Income"), "+10g next round (base 5, interest 4, streak 1).");
  assert.equal(fact(state, "Level"), "Level 8 costs 28g. Common timing: stage 4-5.");
  assert.equal(fact(state, "Shop odds"), "1-cost 19%  ·  2-cost 30%  ·  3-cost 40%  ·  4-cost 10%  ·  5-cost 1%");
});

test("facts at the caps", () => {
  const state = { level: 10, xp: 0, gold: 63 };
  assert.equal(fact(state, "Interest"), "+5g per round, the maximum.");
  assert.equal(fact(state, "Level"), undefined);
});

test("facts never give instructions", () => {
  for (const gold of [0, 8, 30, 58]) {
    for (const level of [3, 6, 8, 9]) {
      for (const { text } of econ.facts({ level, xp: 0, gold })) assert.doesNotMatch(text, /\b(roll|buy|sell|save|should|now)\b/i);
    }
  }
});

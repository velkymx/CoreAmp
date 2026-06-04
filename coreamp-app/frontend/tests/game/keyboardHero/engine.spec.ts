import { describe, it, expect } from "vitest";
import {
  generateChart,
  isOnset,
  laneForSpawn,
  judge,
  scoreFor,
  nextCombo,
  comboMultiplier,
  comboMessage,
  accuracy,
  LANE_COUNT,
  PERFECT_WINDOW,
  GOOD_WINDOW,
} from "@/game/keyboardHero/engine";

describe("generateChart", () => {
  it("is deterministic for the same onsets", () => {
    const onsets = [0.5, 1.2, 1.25, 2.0, 2.4];
    expect(generateChart(onsets)).toEqual(generateChart(onsets));
  });

  it("places every note on a valid lane", () => {
    const notes = generateChart([0.1, 0.7, 1.3, 1.9, 2.5, 3.1]);
    for (const n of notes) {
      expect(n.lane).toBeGreaterThanOrEqual(0);
      expect(n.lane).toBeLessThan(LANE_COUNT);
    }
  });

  it("emits a chord (two lanes at the same time) on every 4th onset", () => {
    const onsets = [0.1, 0.2, 0.3, 0.4]; // index 3 → chord
    const notes = generateChart(onsets);
    const atChord = notes.filter((n) => n.time === 0.4);
    expect(atChord).toHaveLength(2);
    expect(atChord[0].lane).not.toBe(atChord[1].lane);
  });
});

describe("isOnset", () => {
  it("fires when energy clearly exceeds the running average", () => {
    expect(isOnset(0.5, 0.2)).toBe(true);
  });
  it("does not fire on quiet or steady energy", () => {
    expect(isOnset(0.02, 0.01)).toBe(false); // too quiet
    expect(isOnset(0.3, 0.28)).toBe(false); // not enough above average
  });
});

describe("laneForSpawn", () => {
  it("stays within the lane range and varies with the counter", () => {
    const a = laneForSpawn(0, 0);
    const b = laneForSpawn(0, 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(LANE_COUNT);
    expect(a).not.toBe(b);
  });
});

describe("judge", () => {
  it("perfect inside the perfect window", () => {
    expect(judge(0)).toBe("perfect");
    expect(judge(PERFECT_WINDOW)).toBe("perfect");
  });
  it("good between the perfect and good windows", () => {
    expect(judge(PERFECT_WINDOW + 0.01)).toBe("good");
    expect(judge(-GOOD_WINDOW)).toBe("good");
  });
  it("miss outside the good window", () => {
    expect(judge(GOOD_WINDOW + 0.01)).toBe("miss");
  });
});

describe("scoreFor", () => {
  it("100 / 50 / 0", () => {
    expect(scoreFor("perfect")).toBe(100);
    expect(scoreFor("good")).toBe(50);
    expect(scoreFor("miss")).toBe(0);
  });
});

describe("nextCombo", () => {
  it("increments on hits, resets on miss", () => {
    expect(nextCombo(4, "perfect")).toBe(5);
    expect(nextCombo(4, "good")).toBe(5);
    expect(nextCombo(9, "miss")).toBe(0);
  });
});

describe("comboMultiplier", () => {
  it("climbs x1 → x4 with the combo", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(9)).toBe(1);
    expect(comboMultiplier(10)).toBe(2);
    expect(comboMultiplier(20)).toBe(3);
    expect(comboMultiplier(30)).toBe(4);
    expect(comboMultiplier(999)).toBe(4);
  });
});

describe("comboMessage", () => {
  it("fires at milestones only", () => {
    expect(comboMessage(10)).toBe("Nice!");
    expect(comboMessage(25)).toBe("Rock On!");
    expect(comboMessage(50)).toBe("Amazing!");
    expect(comboMessage(100)).toBe("Unstoppable!");
    expect(comboMessage(11)).toBeNull();
    expect(comboMessage(0)).toBeNull();
  });
});

describe("accuracy", () => {
  it("is 0 with no notes", () => {
    expect(accuracy(0, 0, 0)).toBe(0);
  });
  it("weights good as half a perfect", () => {
    expect(accuracy(1, 0, 0)).toBe(100);
    expect(accuracy(0, 1, 0)).toBe(50);
    expect(accuracy(0, 0, 1)).toBe(0);
    expect(accuracy(3, 2, 5)).toBe(40); // (3 + 1) / 10
  });
});

import { describe, it, expect } from "vitest";
import { formatTime } from "@/util/time";

describe("formatTime", () => {
  it("formats whole minutes and seconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(65.9)).toBe("1:05");
  });

  it("treats null/undefined/NaN/negative as zero", () => {
    expect(formatTime(null)).toBe("0:00");
    expect(formatTime(undefined)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
});

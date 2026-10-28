import { describe, expect, it } from "vitest";
import { formatNumber, formatDelta } from "@/lib/format";

describe("display precision without changing source values", () => {
  it("formats distances, elevation, targets and whole-number metrics consistently", () => {
    const source = 98.21038627624512;
    expect(formatNumber(source, 1)).toBe("98.2");
    expect(source).toBe(98.21038627624512);
    expect(formatNumber(21.560310546875, 2, 2)).toBe("21.56");
    expect(formatNumber(21.1000000001, 2)).toBe("21.1");
    expect(formatNumber(133.66666, 0)).toBe("134");
    expect(formatNumber(12345.6789, 1)).toBe("12,345.7");
    expect(formatNumber(1.005, 2, 2)).toBe("1.01");
  });
  it("distinguishes missing measurements and zero, and avoids negative rounded zero", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity])
      expect(formatNumber(v)).toBe("—");
    expect(formatNumber(0, 1)).toBe("0");
    expect(formatNumber(-0.000001, 2)).toBe("0");
    expect(formatDelta(-0.000001)).toBe("0.00");
    expect(formatDelta(0.011111)).toBe("+0.01");
    expect(formatDelta(-0.011111)).toBe("-0.01");
  });
});

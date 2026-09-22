import { describe, expect, it } from "vitest";

import { calendarDateFromIso } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import { systemClock } from "@/server/clock";

describe("Clock", () => {
  it("fixedClock always returns its date", () => {
    const clock = fixedClock(calendarDateFromIso("2026-09-22"));
    expect(clock.today()).toBe("2026-09-22");
    expect(clock.today()).toBe("2026-09-22");
  });

  it("systemClock resolves today in the owner's time zone (Asia/Dhaka, UTC+6)", () => {
    const at = (iso: string) => systemClock("Asia/Dhaka", () => new Date(iso)).today();
    expect(at("2026-09-21T17:59:59Z")).toBe("2026-09-21");
    expect(at("2026-09-21T18:00:00Z")).toBe("2026-09-22");
    expect(at("2026-12-31T18:00:00Z")).toBe("2027-01-01");
  });

  it("the same instant is a different calendar date in different zones", () => {
    const instant = () => new Date("2026-09-21T20:00:00Z");
    expect(systemClock("Asia/Dhaka", instant).today()).toBe("2026-09-22");
    expect(systemClock("America/New_York", instant).today()).toBe("2026-09-21");
  });

  it("rejects an unknown time zone at construction", () => {
    expect(() => systemClock("Mars/Olympus_Mons")).toThrow(RangeError);
  });

  it("reads real time by default", () => {
    expect(systemClock("Asia/Dhaka").today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

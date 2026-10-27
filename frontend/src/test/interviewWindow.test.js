import { describe, expect, it } from "vitest";
import { canStartInterview, startOpensAt } from "../lib/interviewWindow.js";

const SCHEDULED = "2026-10-20T14:00:00Z";
const at = (iso) => new Date(iso).getTime();

describe("canStartInterview", () => {
  it("is locked more than 10 minutes before the scheduled time", () => {
    expect(canStartInterview(SCHEDULED, at("2026-10-20T13:49:59Z"))).toBe(false);
  });

  it("opens exactly 10 minutes before the scheduled time", () => {
    expect(canStartInterview(SCHEDULED, at("2026-10-20T13:50:00Z"))).toBe(true);
  });

  it("stays open any time after the scheduled time", () => {
    expect(canStartInterview(SCHEDULED, at("2026-10-27T09:00:00Z"))).toBe(true);
  });

  it("does not gate unscheduled or unparseable interviews", () => {
    expect(canStartInterview(null)).toBe(true);
    expect(canStartInterview("not a date")).toBe(true);
    expect(startOpensAt(null)).toBeNull();
  });
});

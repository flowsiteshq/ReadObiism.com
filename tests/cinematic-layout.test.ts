import { describe, expect, it } from "vitest";

import { getCinematicTopClearance } from "../lib/cinematic-layout";

describe("cinematic safe-area spacing", () => {
  it("keeps the lockup clear of system UI when no inset is reported", () => {
    expect(getCinematicTopClearance()).toBe(68);
    expect(getCinematicTopClearance(0)).toBe(68);
  });

  it("adds breathing room below a reported notch or status bar inset", () => {
    expect(getCinematicTopClearance(24)).toBe(68);
    expect(getCinematicTopClearance(47)).toBe(68);
    expect(getCinematicTopClearance(59)).toBe(77);
  });
});

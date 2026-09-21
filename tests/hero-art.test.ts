import { describe, expect, it } from "vitest";

import { PORTRAIT_HERO_COPY, PORTRAIT_HERO_IMAGE } from "../lib/hero-art";

describe("portrait hero configuration", () => {
  it("uses a hosted visual asset rather than a bundled large media file", () => {
    expect(PORTRAIT_HERO_IMAGE).toMatch(/^https:\/\/files\.manuscdn\.com\/.+\.png$/);
  });

  it("keeps the reference-inspired editorial hierarchy in the app", () => {
    expect(PORTRAIT_HERO_COPY.title).toBe("Character\nBuilds\nNations.");
    expect(PORTRAIT_HERO_COPY.principles).toEqual(["CHAPTERS", "KEY IDEAS", "SAVED", "THE FUTURE"]);
  });
});

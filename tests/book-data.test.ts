import { describe, expect, it } from "vitest";

import { chapters, getChapter } from "../lib/book-data";

describe("OBI-ISM reader content", () => {
  it("exposes an ordered reading section with renderable content", () => {
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].paragraphs.length).toBeGreaterThan(0);
  });

  it("falls back to the opening section when a route has no valid chapter id", () => {
    expect(getChapter("not-a-chapter").id).toBe(chapters[0].id);
  });
});

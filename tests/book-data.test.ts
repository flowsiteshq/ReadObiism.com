import { describe, expect, it } from "vitest";

import { chapters, getChapter } from "../lib/book-data";

describe("OBI-ISM reader content", () => {
  it("exposes the complete approved manuscript structure with renderable content", () => {
    expect(chapters).toHaveLength(39);
    expect(chapters[0].paragraphs.length).toBeGreaterThan(0);
    expect(chapters.find((chapter) => chapter.id === "chapter-29")?.title).toBe("The Legacy Beyond Politics");
    expect(chapters.find((chapter) => chapter.id === "appendix-2")?.title).toBe("Further Research by Chapter");
  });

  it("falls back to the opening section when a route has no valid chapter id", () => {
    expect(getChapter("not-a-chapter").id).toBe(chapters[0].id);
  });
});

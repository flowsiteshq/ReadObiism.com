import { describe, expect, it } from "vitest";

import { chapters, getChapter } from "../lib/book-data";

describe("OBI-ISM public book metadata", () => {
  it("exposes the complete structure without bundling manuscript paragraphs", () => {
    expect(chapters).toHaveLength(39);
    expect(chapters.every((chapter) => chapter.paragraphs.length === 0)).toBe(true);
    expect(chapters.reduce((total, chapter) => total + chapter.paragraphs.length, 0)).toBe(0);
    expect(chapters.find((chapter) => chapter.id === "chapter-29")?.title).toBe("The Legacy Beyond Politics");
    expect(chapters.find((chapter) => chapter.id === "appendix-2")?.title).toBe("Further Research by Chapter");
  });

  it("keeps only short public metadata for each section", () => {
    expect(chapters.every((chapter) => chapter.summary.length > 0 && chapter.summary.length <= 180)).toBe(true);
  });

  it("falls back to the opening section when a route has no valid chapter id", () => {
    expect(getChapter("not-a-chapter").id).toBe(chapters[0].id);
  });
});

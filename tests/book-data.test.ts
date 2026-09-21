import { describe, expect, it } from "vitest";

import { chapters, getChapter } from "../lib/book-data";

describe("OBI-ISM reader content", () => {
  it("exposes the complete approved manuscript structure with renderable content", () => {
    expect(chapters).toHaveLength(39);
    expect(chapters.every((chapter) => chapter.paragraphs.length > 0)).toBe(true);
    expect(chapters.reduce((total, chapter) => total + chapter.paragraphs.length, 0)).toBeGreaterThan(1_000);
    expect(chapters.find((chapter) => chapter.id === "chapter-29")?.title).toBe("The Legacy Beyond Politics");
    expect(chapters.find((chapter) => chapter.id === "appendix-2")?.title).toBe("Further Research by Chapter");
  });

  it("preserves the revised preface as continuous reader paragraphs", () => {
    const preface = chapters.find((chapter) => chapter.id === "preface");
    expect(preface?.paragraphs.join(" ")).toContain("He did not shout. He did not accumulate visible wealth");
    expect(preface?.paragraphs.join(" ")).not.toContain("He did not perform.");
    expect(preface?.paragraphs.some((paragraph) => paragraph.startsWith("inspiration from a life courageously lived"))).toBe(false);
  });

  it("falls back to the opening section when a route has no valid chapter id", () => {
    expect(getChapter("not-a-chapter").id).toBe(chapters[0].id);
  });
});

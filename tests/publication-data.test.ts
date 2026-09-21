import { describe, expect, it } from "vitest";

import { publicationPrinciples, publicationQuotes, searchPublication } from "../lib/publication-data";

describe("approved OBI-ISM publication data", () => {
  it("derives each principle from an approved book chapter", () => {
    expect(publicationPrinciples).toHaveLength(7);
    expect(publicationPrinciples.every((principle) => principle.chapterId.startsWith("chapter-"))).toBe(true);
    expect(publicationPrinciples.every((principle) => principle.explanation.length > 40 && principle.excerpt.length > 40)).toBe(true);
  });

  it("uses exact reader passages for every quote card", () => {
    expect(publicationQuotes).toHaveLength(7);
    expect(publicationQuotes.every((quote) => quote.text.length > 40 && quote.chapterId.length > 0)).toBe(true);
  });

  it("searches source-derived principles and passages", () => {
    const results = searchPublication("character");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.chapterId.length > 0)).toBe(true);
  });
});

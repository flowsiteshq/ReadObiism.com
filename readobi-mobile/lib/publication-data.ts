import { getChapter } from "./book-data";

export type PublicationPrinciple = {
  id: string;
  title: string;
  chapterId: string;
  explanation: string;
  excerpt: string;
};

const principleSources = [
  { id: "prudence", chapterId: "chapter-7" },
  { id: "honesty", chapterId: "chapter-8" },
  { id: "simplicity", chapterId: "chapter-9" },
  { id: "justice", chapterId: "chapter-10" },
  { id: "delayed-gratification", chapterId: "chapter-11" },
  { id: "accountability", chapterId: "chapter-12" },
  { id: "leadership", chapterId: "chapter-13" },
] as const;

/**
 * Every editorial card is derived directly from an approved book chapter.
 * No quote, claim, position, or reflection language is authored in the UI layer.
 */
export const publicationPrinciples: PublicationPrinciple[] = principleSources.map((source) => {
  const chapter = getChapter(source.chapterId);
  return {
    id: source.id,
    title: chapter.title,
    chapterId: chapter.id,
    explanation: chapter.summary,
    excerpt: chapter.summary,
  };
});

export type PublicationQuote = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  text: string;
};

const quoteSources = [
  { id: "preface-character-infrastructure", chapterId: "preface" },
  { id: "introduction-public-infrastructure", chapterId: "introduction" },
  { id: "chapter-4-discipline", chapterId: "chapter-4" },
  { id: "chapter-7-prudence", chapterId: "chapter-7" },
  { id: "chapter-8-honesty", chapterId: "chapter-8" },
  { id: "chapter-18-public-funds", chapterId: "chapter-18" },
  { id: "epilogue-question", chapterId: "epilogue" },
] as const;

export const publicationQuotes: PublicationQuote[] = quoteSources.map((source) => {
  const chapter = getChapter(source.chapterId);
  return {
    id: source.id,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    text: chapter.summary,
  };
});

export type PublicationSearchResult =
  | { kind: "chapter"; id: string; title: string; subtitle: string; chapterId: string }
  | { kind: "principle"; id: string; title: string; subtitle: string; chapterId: string }
  | { kind: "quote"; id: string; title: string; subtitle: string; chapterId: string };

export function searchPublication(query: string): PublicationSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const chapterResults = publicationPrinciples
    .filter((item) => `${item.title} ${item.explanation} ${item.excerpt}`.toLowerCase().includes(needle))
    .map((item) => ({ kind: "principle" as const, id: item.id, title: item.title, subtitle: item.explanation, chapterId: item.chapterId }));

  const quoteResults = publicationQuotes
    .filter((item) => `${item.chapterTitle} ${item.text}`.toLowerCase().includes(needle))
    .map((item) => ({ kind: "quote" as const, id: item.id, title: item.chapterTitle, subtitle: item.text, chapterId: item.chapterId }));

  return [...chapterResults, ...quoteResults];
}

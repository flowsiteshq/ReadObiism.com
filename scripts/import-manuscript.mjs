import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, "manuscript", "obi-ism-manuscript.txt");
const targetPath = join(projectRoot, "lib", "book-data.ts");
const manuscript = readFileSync(sourcePath, "utf8").replace(/\r/g, "").replace(/\f/g, "\n");

const sections = [
  { id: "preface", marker: "PREFACE", endMarker: "TABLE OF CONTENTS", label: "PREFACE", title: "The Philosopher Who Didn't Know He Was One", kind: "frontmatter" },
  { id: "introduction", marker: "INTRODUCTION", label: "INTRODUCTION", title: "The Philosophy Hidden in a Life", kind: "frontmatter" },
  { id: "part-1", marker: "PART I", label: "PART I", title: "The Making of the Philosophy", kind: "part", part: "PART I" },
  { id: "chapter-1", marker: "CHAPTER ONE", label: "CHAPTER ONE", title: "The Child Who Should Have Been Invisible", kind: "chapter", part: "PART I" },
  { id: "chapter-2", marker: "CHAPTER TWO", label: "CHAPTER TWO", title: "The Society of Broken Promises", kind: "chapter", part: "PART I" },
  { id: "chapter-3", marker: "CHAPTER THREE", label: "CHAPTER THREE", title: "The Marketplace University", kind: "chapter", part: "PART I" },
  { id: "chapter-4", marker: "CHAPTER FOUR", label: "CHAPTER FOUR", title: "The Discipline of Character", kind: "chapter", part: "PART I" },
  { id: "chapter-5", marker: "CHAPTER FIVE", label: "CHAPTER FIVE", title: "The Architecture of Integrity", kind: "chapter", part: "PART I" },
  { id: "chapter-6", marker: "CHAPTER SIX", label: "CHAPTER SIX", title: "The Two Paths: Wealth or Vanity", kind: "chapter", part: "PART I" },
  { id: "part-2", marker: "PART II", label: "PART II", title: "The Foundations of OBI-ISM", kind: "part", part: "PART II" },
  { id: "chapter-7", marker: "CHAPTER SEVEN", label: "CHAPTER SEVEN", title: "Prudence: The Discipline of Sacred Stewardship", kind: "chapter", part: "PART II" },
  { id: "chapter-8", marker: "CHAPTER EIGHT", label: "CHAPTER EIGHT", title: "Honesty: Civilization's Invisible Currency", kind: "chapter", part: "PART II" },
  { id: "chapter-9", marker: "CHAPTER NINE", label: "CHAPTER NINE", title: "Simplicity: The Strength of Restraint", kind: "chapter", part: "PART II" },
  { id: "chapter-10", marker: "CHAPTER TEN", label: "CHAPTER TEN", title: "Justice and Fairness: The Architecture of Peace", kind: "chapter", part: "PART II" },
  { id: "chapter-11", marker: "CHAPTER ELEVEN", label: "CHAPTER ELEVEN", title: "Delayed Gratification: The Lost Discipline", kind: "chapter", part: "PART II" },
  { id: "chapter-12", marker: "CHAPTER TWELVE", label: "CHAPTER TWELVE", title: "Accountability: The Courage to Be Measured", kind: "chapter", part: "PART II" },
  { id: "chapter-13", marker: "CHAPTER THIRTEEN", label: "CHAPTER THIRTEEN", title: "Leadership Without Arrogance", kind: "chapter", part: "PART II" },
  { id: "chapter-14", marker: "CHAPTER FOURTEEN", label: "CHAPTER FOURTEEN", title: "The Human Side of Governance", kind: "chapter", part: "PART II" },
  { id: "part-3", marker: "PART III OBI-ISM", label: "PART III", title: "Business, Power, and Public Service", kind: "part", part: "PART III" },
  { id: "chapter-15", marker: "CHAPTER FIFTEEN", label: "CHAPTER FIFTEEN", title: "Ethics in Private Enterprise", kind: "chapter", part: "PART III" },
  { id: "chapter-16", marker: "CHAPTER SIXTEEN", label: "CHAPTER SIXTEEN", title: "Why Character Eats Strategy for Breakfast", kind: "chapter", part: "PART III" },
  { id: "chapter-17", marker: "CHAPTER SEVENTEEN", label: "CHAPTER SEVENTEEN", title: "Governing with Scarcity Mentality", kind: "chapter", part: "PART III" },
  { id: "chapter-18", marker: "CHAPTER EIGHTEEN", label: "CHAPTER EIGHTEEN", title: "Public Funds Are Sacred", kind: "chapter", part: "PART III" },
  { id: "chapter-19", marker: "CHAPTER NINETEEN", label: "CHAPTER NINETEEN", title: "Leadership During Crisis", kind: "chapter", part: "PART III" },
  { id: "chapter-20", marker: "CHAPTER TWENTY", label: "CHAPTER TWENTY", title: "Education as National Infrastructure", kind: "chapter", part: "PART III" },
  { id: "chapter-21", marker: "CHAPTER TWENTY-ONE", label: "CHAPTER TWENTY-ONE", title: "Economic Thinking and National Development", kind: "chapter", part: "PART III" },
  { id: "part-4", marker: "PART IV", label: "PART IV", title: "OBI-ISM and the Future of Society", kind: "part", part: "PART IV" },
  { id: "chapter-22", marker: "CHAPTER TWENTY-TWO", label: "CHAPTER TWENTY-TWO", title: "Raising Children on Principles", kind: "chapter", part: "PART IV" },
  { id: "chapter-23", marker: "CHAPTER TWENTY-THREE", label: "CHAPTER TWENTY-THREE", title: "The Collapse of Value Systems", kind: "chapter", part: "PART IV" },
  { id: "chapter-24", marker: "CHAPTER TWENTY-FOUR", label: "CHAPTER TWENTY-FOUR", title: "Rebuilding Civic Trust", kind: "chapter", part: "PART IV" },
  { id: "chapter-25", marker: "CHAPTER TWENTY-FIVE", label: "CHAPTER TWENTY-FIVE", title: "Why Nations Fail Morally Before Economically", kind: "chapter", part: "PART IV" },
  { id: "chapter-26", marker: "CHAPTER TWENTY-SIX", label: "CHAPTER TWENTY-SIX", title: "A New Model for African Leadership", kind: "chapter", part: "PART IV" },
  { id: "chapter-27", marker: "CHAPTER TWENTY-SEVEN", label: "CHAPTER TWENTY-SEVEN", title: "The Global Relevance of OBI-ISM", kind: "chapter", part: "PART IV" },
  { id: "chapter-28", marker: "CHAPTER TWENTY-EIGHT", label: "CHAPTER TWENTY-EIGHT", title: "Building a Fairer Society", kind: "chapter", part: "PART IV" },
  { id: "chapter-29", marker: "CHAPTER TWENTY-NINE", label: "CHAPTER TWENTY-NINE", title: "The Legacy Beyond Politics", kind: "chapter", part: "PART IV" },
  { id: "epilogue", marker: "EPILOGUE", label: "EPILOGUE", title: "The Question That Changes Everything", kind: "backmatter" },
  { id: "appendix-1", marker: "APPENDIX I", label: "APPENDIX I", title: "The Principles of OBI-ISM: A Summary", kind: "appendix" },
  { id: "appendix-2", marker: "APPENDIX II", label: "APPENDIX II", title: "Further Research by Chapter", kind: "appendix" },
  { id: "about-authors", marker: "ABOUT THE AUTHORS", label: "ABOUT THE AUTHORS", title: "About the Authors", kind: "backmatter" },
];

function locate(marker) {
  const pattern = new RegExp(`^\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const match = pattern.exec(manuscript);
  if (!match || match.index === undefined) throw new Error(`Section marker not found: ${marker}`);
  return { index: match.index, contentStart: match.index + match[0].length };
}

const located = sections.map((section) => ({ ...section, ...locate(section.marker) }));

function normalise(value) {
  return value.replace(/[—–:.,'’\-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractParagraphs(section, next) {
  const block = manuscript.slice(section.contentStart, next?.index ?? manuscript.length);
  const lines = block.split("\n").map((line) => line.trim());
  const ignored = new Set([
    normalise(section.marker),
    normalise(section.title),
    normalise(`${section.label}: ${section.title}`),
    normalise(`${section.part ?? ""}: ${section.title}`),
    normalise("A Philosophy of Responsible Living"),
  ]);
  const retained = lines.map((line) => {
    const normalizedLine = normalise(line);
    const isPageNumber = /^\d+$/.test(line);
    const isChapterSummary = /^chapter .+ summary$/i.test(line);
    const isRepeatedSectionTitle = ignored.has(normalizedLine);
    return isPageNumber || isChapterSummary || isRepeatedSectionTitle ? "" : line;
  });

  return retained
    .join("\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 40);
}

const manuscriptSections = located.map((section, index) => {
  const paragraphs = extractParagraphs(section, section.endMarker ? locate(section.endMarker) : located[index + 1]);
  if (paragraphs.length === 0) throw new Error(`No body text was extracted for ${section.id}`);
  const firstParagraph = paragraphs.find((paragraph) => paragraph.length > 80) ?? paragraphs[0];
  const summary = firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trimEnd()}…` : firstParagraph;
  const { index: _index, contentStart: _contentStart, marker: _marker, endMarker: _endMarker, ...metadata } = section;
  return { ...metadata, summary, paragraphs };
});

const file = `// Generated from the approved OBI-ISM manuscript. Do not edit manually; update the source text and run scripts/import-manuscript.mjs.\n\nexport type BookSectionKind = "frontmatter" | "part" | "chapter" | "backmatter" | "appendix";\n\nexport type BookChapter = {\n  id: string;\n  label: string;\n  title: string;\n  summary: string;\n  paragraphs: string[];\n  kind: BookSectionKind;\n  part?: string;\n};\n\nexport const BOOK_TITLE = "OBI-ISM";\nexport const BOOK_SUBTITLE = "Building a Just Society Through Character";\nexport const BOOK_AUTHOR = "Eze Echesi & Mpamugo";\n\nexport const chapters: BookChapter[] = ${JSON.stringify(manuscriptSections, null, 2)};\n\nexport function getChapter(id?: string) {\n  return chapters.find((chapter) => chapter.id === id) ?? chapters[0];\n}\n`;

writeFileSync(targetPath, file, "utf8");
console.log(`Imported ${manuscriptSections.length} reader sections and ${manuscriptSections.reduce((total, section) => total + section.paragraphs.length, 0)} paragraphs.`);

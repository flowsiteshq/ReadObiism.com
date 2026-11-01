// Generated from the approved OBI-ISM manuscript. Metadata only: never add reader paragraphs to this public app module.

export type BookSectionKind = "frontmatter" | "part" | "chapter" | "backmatter" | "appendix";

export type BookChapter = {
  id: string;
  label: string;
  title: string;
  summary: string;
  paragraphs: string[];
  kind: BookSectionKind;
  part?: string;
};

export const BOOK_TITLE = "OBI-ISM";
export const BOOK_SUBTITLE = "Building a Just Society Through Character";
export const BOOK_AUTHOR = "Eze Echesi & Mpamugo";

export const chapters: BookChapter[] = [
  {
    "id": "preface",
    "label": "PREFACE",
    "title": "The Philosopher Who Didn't Know He Was One",
    "kind": "frontmatter",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "introduction",
    "label": "INTRODUCTION",
    "title": "The Philosophy Hidden in a Life",
    "kind": "frontmatter",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "part-1",
    "label": "PART I",
    "title": "The Making of the Philosophy",
    "kind": "part",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-1",
    "label": "CHAPTER ONE",
    "title": "The Child Who Should Have Been Invisible",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-2",
    "label": "CHAPTER TWO",
    "title": "The Society of Broken Promises",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-3",
    "label": "CHAPTER THREE",
    "title": "The Marketplace University",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-4",
    "label": "CHAPTER FOUR",
    "title": "The Discipline of Character",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-5",
    "label": "CHAPTER FIVE",
    "title": "The Architecture of Integrity",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-6",
    "label": "CHAPTER SIX",
    "title": "The Two Paths: Wealth or Vanity",
    "kind": "chapter",
    "part": "PART I",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "part-2",
    "label": "PART II",
    "title": "The Foundations of OBI-ISM",
    "kind": "part",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-7",
    "label": "CHAPTER SEVEN",
    "title": "Prudence: The Discipline of Sacred Stewardship",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-8",
    "label": "CHAPTER EIGHT",
    "title": "Honesty: Civilization's Invisible Currency",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-9",
    "label": "CHAPTER NINE",
    "title": "Simplicity: The Strength of Restraint",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-10",
    "label": "CHAPTER TEN",
    "title": "Justice and Fairness: The Architecture of Peace",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-11",
    "label": "CHAPTER ELEVEN",
    "title": "Delayed Gratification: The Lost Discipline",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-12",
    "label": "CHAPTER TWELVE",
    "title": "Accountability: The Courage to Be Measured",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-13",
    "label": "CHAPTER THIRTEEN",
    "title": "Leadership Without Arrogance",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-14",
    "label": "CHAPTER FOURTEEN",
    "title": "The Human Side of Governance",
    "kind": "chapter",
    "part": "PART II",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "part-3",
    "label": "PART III",
    "title": "Business, Power, and Public Service",
    "kind": "part",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-15",
    "label": "CHAPTER FIFTEEN",
    "title": "Ethics in Private Enterprise",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-16",
    "label": "CHAPTER SIXTEEN",
    "title": "Why Character Eats Strategy for Breakfast",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-17",
    "label": "CHAPTER SEVENTEEN",
    "title": "Governing with Scarcity Mentality",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-18",
    "label": "CHAPTER EIGHTEEN",
    "title": "Public Funds Are Sacred",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-19",
    "label": "CHAPTER NINETEEN",
    "title": "Leadership During Crisis",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-20",
    "label": "CHAPTER TWENTY",
    "title": "Education as National Infrastructure",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-21",
    "label": "CHAPTER TWENTY-ONE",
    "title": "Economic Thinking and National Development",
    "kind": "chapter",
    "part": "PART III",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "part-4",
    "label": "PART IV",
    "title": "OBI-ISM and the Future of Society",
    "kind": "part",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-22",
    "label": "CHAPTER TWENTY-TWO",
    "title": "Raising Children on Principles",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-23",
    "label": "CHAPTER TWENTY-THREE",
    "title": "The Collapse of Value Systems",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-24",
    "label": "CHAPTER TWENTY-FOUR",
    "title": "Rebuilding Civic Trust",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-25",
    "label": "CHAPTER TWENTY-FIVE",
    "title": "Why Nations Fail Morally Before Economically",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-26",
    "label": "CHAPTER TWENTY-SIX",
    "title": "A New Model for African Leadership",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-27",
    "label": "CHAPTER TWENTY-SEVEN",
    "title": "The Global Relevance of OBI-ISM",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-28",
    "label": "CHAPTER TWENTY-EIGHT",
    "title": "Building a Fairer Society",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "chapter-29",
    "label": "CHAPTER TWENTY-NINE",
    "title": "The Legacy Beyond Politics",
    "kind": "chapter",
    "part": "PART IV",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "epilogue",
    "label": "EPILOGUE",
    "title": "The Question That Changes Everything",
    "kind": "backmatter",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "appendix-1",
    "label": "APPENDIX I",
    "title": "The Principles of OBI-ISM: A Summary",
    "kind": "appendix",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "appendix-2",
    "label": "APPENDIX II",
    "title": "Further Research by Chapter",
    "kind": "appendix",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  },
  {
    "id": "about-authors",
    "label": "ABOUT THE AUTHORS",
    "title": "About the Authors",
    "kind": "backmatter",
    "summary": "Open this section to explore the ideas.",
    "paragraphs": []
  }
];

export function getChapter(id?: string) {
  return chapters.find((chapter) => chapter.id === id) ?? chapters[0];
}

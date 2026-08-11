export type BookChapter = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  paragraphs: string[];
};

export const BOOK_TITLE = "OBI-ISM";
export const BOOK_SUBTITLE = "Building a Just Society Through Character";
export const BOOK_AUTHOR = "Echesi A. M. O. E. Onasontaire";

export const chapters: BookChapter[] = [
  {
    id: "preface",
    eyebrow: "FOUNDATIONS · PREFACE",
    title: "A Discovery, Not a Doctrine",
    summary: "The philosophy is presented as a transferable system of responsible living.",
    paragraphs: [
      "This book began as a question, not an answer.",
      "For years, I watched a man navigate public life with what seemed like an almost impossible consistency. He did not shout. He did not perform. He did not accumulate visible wealth while in positions of authority. He travelled without entourages, wore simple clothes, and spoke of public funds as though they were sacred vessels holding the hopes of millions.",
      "At first, I thought I was studying a political figure. I was wrong. I was studying a philosophy in motion.",
      "The central insight that struck me, and that eventually demanded this book, was this: his way of living was not personal eccentricity. It was a coherent, transferable, deeply practical system of living. It is a set of principles about money, truth, power, time, people, and purpose that could be extracted, examined, taught, and lived by anyone, anywhere.",
      "I came to call this system OBI-ISM. The hyphen is deliberate. It separates the name from the doctrine, signalling that this is not about a man but about a method. The name anchors the philosophy in a life actually lived; the “-ISM” transforms that life into universal principles: prudence, honesty, simplicity, justice, delayed gratification, accountability, and service.",
      "This book is an excavation. It digs beneath the surface of one remarkable life to unearth timeless principles that belong to no single person, nation, or era. It moves from the specific—what one person did—to the universal—what all of us can do.",
      "The world does not need more idolatry. What it needs is a renewal of character infrastructure: the invisible moral architecture that supports functional families, honest businesses, trustworthy governments, and peaceful societies. That infrastructure is built one life at a time, one decision at a time, one principle at a time.",
      "I have structured this book in four parts. It explores the making of the philosophy, unpacks its foundational principles, applies them to business and public service, and asks how they can shape child-rearing, institutional reform, national development, and global leadership.",
      "The central question of this book is not “Was this man a good leader?” The central question is: “What would happen if homes, schools, businesses, churches, companies, and governments operated this way?”",
      "If, by the end of this book, you find yourself asking, “What if I lived this way?”, then this book will have done its work. The movement begins not with a political campaign but with a personal decision: principle over convenience, long-term flourishing over short-term gain, character over performance.",
    ],
  },
  {
    id: "introduction",
    eyebrow: "FOUNDATIONS · INTRODUCTION",
    title: "The Philosophy Hidden in a Life",
    summary: "Character is presented as public infrastructure, built through daily choices.",
    paragraphs: [
      "Every great philosophy begins with an act of attention. Someone watches closely, notices patterns, and asks: What is actually happening here? From that sustained attention, principles emerge.",
      "The philosophy explored in this book was lived first as practice and only later articulated as principle. It is not a set of ideas invented in a library and imposed on reality; it is a set of ideas extracted from decades of decisions made in markets, boardrooms, government offices, campaign trails, and ordinary human interactions.",
      "OBI-ISM is a functional philosophy. It is concerned above all with what works to create human flourishing over time. It is pragmatic without being unprincipled, moral without being moralistic, idealistic without being naive.",
      "The central insight is deceptively simple: the way we live matters. Daily choices about resources, truth, power, time, and people accumulate into the kind of society we inhabit. Character is not a private luxury; it is public infrastructure.",
      "There is no gap between personal ethics and public ethics. How a leader spends public money is connected to how a parent spends family income. How a business owner treats customers is connected to how a government official treats citizens. They are the same thing at different scales.",
      "We live in a time of profound disconnection. Our technologies connect us, but our values isolate us. We have more information than any generation in history, but less wisdom about how to live. In this context, the need for a coherent philosophy of living has never been greater.",
      "OBI-ISM does not offer easy answers, but it offers a clear direction. It proposes a framework for approaching decisions about money, truth, power, time, and people that can be applied across countless contexts. The specifics will vary. The principles remain.",
      "Consider this book an invitation: an invitation to examine a life, to extract principles that can transform your own, and to join a quiet revolution of character, built one decision at a time.",
    ],
  },
];

export function getChapter(id?: string) {
  return chapters.find((chapter) => chapter.id === id) ?? chapters[0];
}

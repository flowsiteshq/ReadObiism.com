import AsyncStorage from "@react-native-async-storage/async-storage";

const READING_POSITION_KEY = "obi-ism.reading-position";
const BOOKMARKS_KEY = "obi-ism.bookmarks";
const SAVED_QUOTES_KEY = "obi-ism.saved-quotes";
const READING_GOAL_KEY = "obi-ism.reading-goal";
const READING_ACTIVITY_KEY = "obi-ism.reading-activity";

export type ReadingGoal = 3 | 5 | 7;

type ReadingActivity = {
  sectionId: string;
  readAt: string;
};

export type ReadingPulse = {
  weeklyGoal: ReadingGoal;
  sectionsThisWeek: number;
  activeDays: number;
  bookmarks: number;
  savedQuotes: number;
};

export type ReadingPosition = {
  chapterId: string;
  updatedAt: string;
};

export async function getReadingPosition(): Promise<ReadingPosition | null> {
  const raw = await AsyncStorage.getItem(READING_POSITION_KEY);
  return raw ? (JSON.parse(raw) as ReadingPosition) : null;
}

export async function saveReadingPosition(chapterId: string) {
  const position: ReadingPosition = { chapterId, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(READING_POSITION_KEY, JSON.stringify(position));
  await recordReadingActivity(chapterId, position.updatedAt);
  return position;
}

export async function getBookmarks(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function toggleBookmark(chapterId: string) {
  const saved = await getBookmarks();
  const bookmarks = saved.includes(chapterId)
    ? saved.filter((item) => item !== chapterId)
    : [...saved, chapterId];

  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return bookmarks;
}

export async function getSavedQuotes(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SAVED_QUOTES_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function toggleSavedQuote(quoteId: string) {
  const saved = await getSavedQuotes();
  const quotes = saved.includes(quoteId)
    ? saved.filter((item) => item !== quoteId)
    : [...saved, quoteId];

  await AsyncStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(quotes));
  return quotes;
}

export async function getReadingGoal(): Promise<ReadingGoal> {
  const raw = await AsyncStorage.getItem(READING_GOAL_KEY);
  const goal = Number(raw);
  return goal === 5 || goal === 7 ? goal : 3;
}

export async function saveReadingGoal(goal: ReadingGoal) {
  await AsyncStorage.setItem(READING_GOAL_KEY, String(goal));
  return goal;
}

async function getReadingActivity(): Promise<ReadingActivity[]> {
  const raw = await AsyncStorage.getItem(READING_ACTIVITY_KEY);
  return raw ? (JSON.parse(raw) as ReadingActivity[]) : [];
}

export async function recordReadingActivity(sectionId: string, readAt = new Date().toISOString()) {
  const activity = await getReadingActivity();
  const day = readAt.slice(0, 10);
  const withoutDuplicate = activity.filter((entry) => !(entry.sectionId === sectionId && entry.readAt.slice(0, 10) === day));
  const nextActivity = [...withoutDuplicate, { sectionId, readAt }].slice(-100);
  await AsyncStorage.setItem(READING_ACTIVITY_KEY, JSON.stringify(nextActivity));
  return nextActivity;
}

export async function getReadingPulse(now = new Date()): Promise<ReadingPulse> {
  const [activity, weeklyGoal, bookmarkIds, quoteIds] = await Promise.all([getReadingActivity(), getReadingGoal(), getBookmarks(), getSavedQuotes()]);
  const startOfWindow = new Date(now);
  startOfWindow.setHours(0, 0, 0, 0);
  startOfWindow.setDate(startOfWindow.getDate() - 6);
  const recent = activity.filter((entry) => new Date(entry.readAt) >= startOfWindow);

  return {
    weeklyGoal,
    sectionsThisWeek: new Set(recent.map((entry) => entry.sectionId)).size,
    activeDays: new Set(recent.map((entry) => entry.readAt.slice(0, 10))).size,
    bookmarks: bookmarkIds.length,
    savedQuotes: quoteIds.length,
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";

const READING_POSITION_KEY = "obi-ism.reading-position";
const BOOKMARKS_KEY = "obi-ism.bookmarks";

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

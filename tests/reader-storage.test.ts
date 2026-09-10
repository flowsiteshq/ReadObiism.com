import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

import { getBookmarks, getReadingGoal, getReadingPosition, getReadingPulse, saveReadingGoal, saveReadingPosition, toggleBookmark } from "../lib/reader-storage";

describe("OBI-ISM reader persistence", () => {
  beforeEach(() => storage.clear());

  it("saves and restores the latest reading section", async () => {
    await saveReadingPosition("introduction");

    await expect(getReadingPosition()).resolves.toMatchObject({ chapterId: "introduction" });
  });

  it("adds and removes a chapter bookmark", async () => {
    await expect(toggleBookmark("preface")).resolves.toEqual(["preface"]);
    await expect(getBookmarks()).resolves.toEqual(["preface"]);
    await expect(toggleBookmark("preface")).resolves.toEqual([]);
  });

  it("keeps a private weekly goal and activity pulse", async () => {
    await saveReadingGoal(5);
    await saveReadingPosition("chapter-1");
    await saveReadingPosition("chapter-2");

    await expect(getReadingGoal()).resolves.toBe(5);
    await expect(getReadingPulse()).resolves.toMatchObject({ weeklyGoal: 5, sectionsThisWeek: 2, activeDays: 1 });
  });
});

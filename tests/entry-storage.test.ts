import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

import { hasSeenCinematicEntry, markCinematicEntrySeen } from "../lib/entry-storage";

describe("cinematic entry persistence", () => {
  beforeEach(() => storage.clear());

  it("shows the full ceremony once, then remembers returning readers", async () => {
    await expect(hasSeenCinematicEntry()).resolves.toBe(false);
    await markCinematicEntrySeen();
    await expect(hasSeenCinematicEntry()).resolves.toBe(true);
  });
});

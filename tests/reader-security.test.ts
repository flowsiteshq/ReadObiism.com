import { describe, expect, it } from "vitest";

import worker, { hashDeviceToken } from "../dashboard-worker.js";

const sessionId = `cs_${"a".repeat(16)}`;
const deviceToken = "b".repeat(32);
const section = {
  section_id: "chapter-1",
  label: "CHAPTER ONE",
  title: "A protected chapter",
  kind: "chapter",
  paragraphs_json: JSON.stringify(["A protected paragraph that is long enough to create a section summary for the reader catalogue response."]),
};

async function requestReader(query = "", env = {}) {
  return worker.fetch(new Request(`https://readobiism.com/api/reader${query}`), env);
}

async function authorizedEnvironment() {
  const deviceHash = await hashDeviceToken(deviceToken);
  return {
    OBI_DB: {
      exec: async () => undefined,
      prepare: (sql: string) => ({
        all: async () => ({ results: [section] }),
        bind: (...values: string[]) => ({
          first: async () => {
            if (sql.includes("FROM purchases")) return { checkout_session_id: sessionId };
            if (sql.includes("FROM reader_devices")) return { device_hash: deviceHash };
            if (sql.includes("FROM book_sections WHERE section_id")) return values[0] === section.section_id ? section : null;
            return null;
          },
        }),
      }),
    },
  };
}

describe("licensed reader delivery", () => {
  it.each(["", "?session_id=invalid", `?session_id=${sessionId}`, `?device_token=${deviceToken}`])(
    "returns 403 without a valid session and device token: %s",
    async (query) => {
      const response = await requestReader(query);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).chapters).toBeUndefined();
    },
  );

  it("returns catalogue metadata without reader paragraphs", async () => {
    const response = await requestReader(`?session_id=${sessionId}&device_token=${deviceToken}`, await authorizedEnvironment());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.chapters).toHaveLength(1);
    expect(body.chapters[0].summary).toContain("A protected paragraph");
    expect(body.chapters[0].paragraphs).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("paragraphs_json");
  });

  it("returns paragraphs for one explicitly requested licensed section", async () => {
    const response = await requestReader(`?session_id=${sessionId}&device_token=${deviceToken}&section_id=chapter-1`, await authorizedEnvironment());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.chapter.id).toBe("chapter-1");
    expect(body.chapter.paragraphs).toHaveLength(1);
    expect(body.chapters).toBeUndefined();
  });

  it("does not expose another section through the section endpoint", async () => {
    const response = await requestReader(`?session_id=${sessionId}&device_token=${deviceToken}&section_id=chapter-2`, await authorizedEnvironment());
    expect(response.status).toBe(404);
  });
});

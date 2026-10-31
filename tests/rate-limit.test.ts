import { describe, expect, it } from "vitest";

import worker, { consumeLimit, hashDeviceToken, RATE_LIMITS } from "../dashboard-worker.js";

const sessionId = `cs_${"a".repeat(16)}`;
const deviceToken = "b".repeat(32);
const section = {
  section_id: "chapter-1",
  label: "CHAPTER ONE",
  title: "A protected chapter",
  kind: "chapter",
  paragraphs_json: JSON.stringify(["A protected paragraph that is long enough to create a section summary for the reader catalogue response."]),
};

/**
 * Minimal in-memory D1 double. It implements the only statements the reader
 * and limiter paths use, including the atomic request_limits upsert.
 */
function createDatabase(deviceHash: string) {
  const counters = new Map<string, { window_start: number; count: number }>();
  const abuseEvents: unknown[][] = [];

  const db = {
    exec: async () => undefined,
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.startsWith("INSERT INTO request_limits")) {
                const bucket = String(values[0]);
                const windowStart = Number(values[1]);
                const current = counters.get(bucket);
                const next = !current || current.window_start !== windowStart
                  ? { window_start: windowStart, count: 1 }
                  : { window_start: windowStart, count: current.count + 1 };
                counters.set(bucket, next);
                return { count: next.count };
              }
              if (sql.includes("FROM purchases")) return { checkout_session_id: sessionId };
              if (sql.includes("FROM reader_devices")) return { device_hash: deviceHash };
              if (sql.includes("FROM book_sections WHERE section_id")) return values[0] === section.section_id ? section : null;
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO abuse_events")) abuseEvents.push(values);
              return { meta: { changes: 1 } };
            },
          };
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [section] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  return { env: { OBI_DB: db }, counters, abuseEvents };
}

function windowStartFor(limitName: keyof typeof RATE_LIMITS, now: number) {
  const { windowSeconds } = RATE_LIMITS[limitName];
  return now - (now % windowSeconds);
}

describe("fixed-window rate limiting", () => {
  it("allows up to the limit, blocks the next request, then resets", async () => {
    const { env } = createDatabase("unused");
    const { limit, windowSeconds } = RATE_LIMITS["reader-sections"];
    const now = 1_700_000_000;

    for (let index = 0; index < limit; index += 1) {
      await expect(consumeLimit(env, "reader-sections", deviceToken, now)).resolves.toMatchObject({ allowed: true });
    }

    const blocked = await consumeLimit(env, "reader-sections", deviceToken, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(windowStartFor("reader-sections", now) + windowSeconds - now);

    const nextWindow = await consumeLimit(env, "reader-sections", deviceToken, now + windowSeconds);
    expect(nextWindow.allowed).toBe(true);
  });

  it("counts identities independently", async () => {
    const { env } = createDatabase("unused");
    const { limit } = RATE_LIMITS["reader-sections"];
    const now = 1_700_000_000;

    for (let index = 0; index < limit; index += 1) {
      await consumeLimit(env, "reader-sections", deviceToken, now);
    }

    await expect(consumeLimit(env, "reader-sections", "c".repeat(32), now)).resolves.toMatchObject({ allowed: true });
  });

  it("fails open when the database binding is unavailable", async () => {
    await expect(consumeLimit({}, "reader-sections", deviceToken)).resolves.toMatchObject({ allowed: true });
  });
});

describe("reader abuse limits", () => {
  it("returns 429 once a device exceeds its section budget", async () => {
    const deviceHash = await hashDeviceToken(deviceToken);
    const { env, abuseEvents } = createDatabase(deviceHash);
    const query = `?session_id=${sessionId}&device_token=${deviceToken}&section_id=${section.section_id}`;
    const { limit } = RATE_LIMITS["reader-sections"];

    for (let index = 0; index < limit; index += 1) {
      const response = await worker.fetch(new Request(`https://readobiism.com/api/reader${query}`), env);
      expect(response.status).toBe(200);
    }

    const limited = await worker.fetch(new Request(`https://readobiism.com/api/reader${query}`), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).error).toContain("Too many requests");
    expect(abuseEvents).toHaveLength(1);
    expect(abuseEvents[0]).toContain("reader-sections");
  });
});

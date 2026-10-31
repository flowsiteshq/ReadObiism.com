import { describe, expect, it } from "vitest";

import worker, { giftDetails, normalizeGiftCode, validGiftCode } from "../dashboard-worker.js";

const deviceToken = "b".repeat(32);

function checkoutEnvironment(overrides: { giftCodeExists?: boolean } = {}) {
  return {
    OBI_DB: {
      exec: async () => undefined,
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes("FROM gift_orders") && overrides.giftCodeExists) return { status: "active" };
            if (sql.includes("request_limits")) return { count: 1 };
            return null;
          },
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    },
  };
}

async function checkout(body: Record<string, unknown>, env = checkoutEnvironment()) {
  return worker.fetch(new Request("https://readobiism.com/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com", device_token: deviceToken, currency: "USD", ...body }),
  }), env);
}

describe("gift codes", () => {
  it("normalizes lowercase and spaced codes", () => {
    expect(normalizeGiftCode(" obi-7k2m-p9qx-4hwd ")).toBe("OBI-7K2M-P9QX-4HWD");
  });

  it("accepts only the OBI-XXXX-XXXX-XXXX format", () => {
    expect(validGiftCode("OBI-7K2M-P9QX-4HWD")).toBe(true);
    expect(validGiftCode("OBI-7K2M-P9QX")).toBe(false);
    expect(validGiftCode("GIFT-7K2M-P9QX-4HWD")).toBe(false);
    expect(validGiftCode("OBI-7K2M-P9QX-4H!D")).toBe(false);
  });
});

describe("gift checkout", () => {
  it("requires a valid unique code", async () => {
    const response = await checkout({
      gift: true,
      gift_code: "not-a-code",
      recipient_name: "Ada",
      recipient_email: "ada@example.com",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("gift code");
  });

  it("requires the friend's name", async () => {
    const response = await checkout({
      gift: true,
      gift_code: "OBI-7K2M-P9QX-4HWD",
      recipient_name: "",
      recipient_email: "ada@example.com",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("friend's name");
  });

  it("requires a valid friend email that differs from the buyer", async () => {
    const invalid = await checkout({
      gift: true,
      gift_code: "OBI-7K2M-P9QX-4HWD",
      recipient_name: "Ada",
      recipient_email: "not-an-email",
    });
    expect(invalid.status).toBe(400);

    const same = await checkout({
      gift: true,
      gift_code: "OBI-7K2M-P9QX-4HWD",
      recipient_name: "Ada",
      recipient_email: "buyer@example.com",
    });
    expect(same.status).toBe(400);
    expect((await same.json()).error).toContain("different email");
  });

  it("rejects a code that is already in use", async () => {
    const response = await checkout({
      gift: true,
      gift_code: "OBI-7K2M-P9QX-4HWD",
      recipient_name: "Ada",
      recipient_email: "ada@example.com",
    }, checkoutEnvironment({ giftCodeExists: true }));
    expect(response.status).toBe(409);
  });

  it("proceeds to the payment provider when the gift is valid", async () => {
    const response = await checkout({
      gift: true,
      gift_code: "OBI-7K2M-P9QX-4HWD",
      recipient_name: "Ada",
      recipient_email: "ada@example.com",
      gift_message: "Read this slowly.",
    });
    // No Stripe secret is configured in this test environment.
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("not configured");
  });
});

describe("gift metadata", () => {
  it("extracts a complete gift payload from checkout metadata", () => {
    expect(giftDetails({
      gift: "1",
      gift_code: "obi-7k2m-p9qx-4hwd",
      recipient_name: " Ada ",
      recipient_email: " ADA@EXAMPLE.COM ",
      gift_message: " Enjoy ",
    })).toEqual({
      code: "OBI-7K2M-P9QX-4HWD",
      recipientName: "Ada",
      recipientEmail: "ada@example.com",
      message: "Enjoy",
    });
  });

  it("ignores ordinary purchases and incomplete gifts", () => {
    expect(giftDetails({})).toBeNull();
    expect(giftDetails({ gift: "1", gift_code: "OBI-7K2M-P9QX-4HWD" })).toBeNull();
  });
});

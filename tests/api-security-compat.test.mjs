import { createHash } from "node:crypto";
import { test, expect } from "vitest";
import { hashDeviceToken, validDeviceToken, validSessionId } from "../dashboard-worker.js";

test("device token hashes remain compatible with existing stored bindings", async () => {
  const token = "synthetic-reader-device-token-123456";
  expect(await hashDeviceToken(token)).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
  expect(validDeviceToken(token)).toBe(true);
});

test("existing Stripe and Paystack references remain supported", () => {
  expect(validSessionId(`cs_${"a".repeat(16)}`)).toBe(true);
  expect(validSessionId(`obi_${"a".repeat(24)}`)).toBe(true);
  expect(validSessionId("invalid")).toBe(false);
});

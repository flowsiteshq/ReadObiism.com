import { describe, expect, it } from "vitest";

import { WEBSITE_STATUS, WEBSITE_VALUE_POINTS } from "../lib/website-content";

describe("public OBI-ISM website content", () => {
  it("states the currently available web edition without claiming unlaunched stores", () => {
    expect(WEBSITE_STATUS).toBe("WEB EDITION AVAILABLE NOW");
  });

  it("describes the complete, source-backed, and personal reading paths", () => {
    expect(WEBSITE_VALUE_POINTS).toHaveLength(3);
    expect(WEBSITE_VALUE_POINTS.map((item) => item.number)).toEqual(["01", "02", "03"]);
  });
});

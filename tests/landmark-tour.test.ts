import { describe, expect, it } from "vitest";

import {
  formatLandmarkTourTime,
  getLandmarkForSecond,
  landmarkStops,
  LANDMARK_SEGMENT_SECONDS,
  LANDMARK_TOUR_SECONDS,
  LANDMARK_TOUR_VIDEO,
} from "../lib/landmark-tour";

describe("landmark tour", () => {
  it("defines an eight-stop, 64-second Nigerian landmark loop", () => {
    expect(LANDMARK_TOUR_SECONDS).toBe(64);
    expect(LANDMARK_SEGMENT_SECONDS).toBe(8);
    expect(landmarkStops).toEqual(["Lagos", "Abuja", "Zuma Rock", "Kano", "Olumo Rock", "Idanre Hills", "Obudu Mountain Resort", "Calabar"]);
    expect(LANDMARK_TOUR_VIDEO).toMatch(/^https:\/\/files\.manuscdn\.com\/.+\.mp4$/);
  });

  it("maps every eight-second interval to the right landmark and loops", () => {
    expect(getLandmarkForSecond(0)).toBe("Lagos");
    expect(getLandmarkForSecond(8)).toBe("Abuja");
    expect(getLandmarkForSecond(16)).toBe("Zuma Rock");
    expect(getLandmarkForSecond(24)).toBe("Kano");
    expect(getLandmarkForSecond(32)).toBe("Olumo Rock");
    expect(getLandmarkForSecond(40)).toBe("Idanre Hills");
    expect(getLandmarkForSecond(48)).toBe("Obudu Mountain Resort");
    expect(getLandmarkForSecond(56)).toBe("Calabar");
    expect(getLandmarkForSecond(64)).toBe("Lagos");
  });

  it("formats the observable playback clock", () => {
    expect(formatLandmarkTourTime(1)).toBe("00:01");
    expect(formatLandmarkTourTime(17)).toBe("00:17");
    expect(formatLandmarkTourTime(64)).toBe("00:00");
  });
});

export const LANDMARK_TOUR_VIDEO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031545745/eXUocPcJCgwOvSgr.mp4";

export const LANDMARK_TOUR_SECONDS = 64;
export const LANDMARK_SEGMENT_SECONDS = 8;

export const landmarkStops = [
  "Lagos",
  "Abuja",
  "Zuma Rock",
  "Kano",
  "Olumo Rock",
  "Idanre Hills",
  "Obudu Mountain Resort",
  "Calabar",
] as const;

export function getLandmarkForSecond(second: number): (typeof landmarkStops)[number] {
  const normalizedSecond = ((Math.floor(second) % LANDMARK_TOUR_SECONDS) + LANDMARK_TOUR_SECONDS) % LANDMARK_TOUR_SECONDS;
  const stopIndex = Math.min(Math.floor(normalizedSecond / LANDMARK_SEGMENT_SECONDS), landmarkStops.length - 1);
  return landmarkStops[stopIndex];
}

export function formatLandmarkTourTime(second: number): string {
  const normalizedSecond = ((Math.floor(second) % LANDMARK_TOUR_SECONDS) + LANDMARK_TOUR_SECONDS) % LANDMARK_TOUR_SECONDS;
  return `00:${String(normalizedSecond).padStart(2, "0")}`;
}

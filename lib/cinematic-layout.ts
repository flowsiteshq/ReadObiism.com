/**
 * Keeps the cinematic lockup below system status content even when a web view
 * does not report a device safe-area inset.
 */
export function getCinematicTopClearance(topInset = 0): number {
  return Math.max(topInset + 18, 68);
}

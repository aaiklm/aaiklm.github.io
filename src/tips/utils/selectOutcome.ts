import type { Probability } from "../types";

/**
 * Selects an outcome (0, 1, or 2) based on probabilities and a random value.
 * The random value is compared against cumulative probabilities.
 *
 * @param probabilities - [P_home, P_draw, P_away] that sum to 1
 * @param randomValue - A random value between 0 and 1
 * @returns "0" for home, "1" for draw, "2" for away
 */
export function selectOutcome(
  probabilities: Probability,
  randomValue: number
): string {
  const cumulative0 = probabilities[0];
  const cumulative1 = cumulative0 + probabilities[1];

  if (randomValue < cumulative0) {
    return "0"; // home win
  } else if (randomValue < cumulative1) {
    return "1"; // draw
  } else {
    return "2"; // away win
  }
}


import type { Outcome, Probability } from "../types";

/**
 * Selects an outcome based on probabilities and a random value.
 * Maps the result to grid notation: "1" for home, "X" for draw, "2" for away.
 *
 * @param probabilities - [P_home, P_draw, P_away] that sum to 1
 * @param randomValue - A random value between 0 and 1
 * @returns "1" for home win, "X" for draw, "2" for away win
 */
export function selectOutcome(
  probabilities: Probability,
  randomValue: number
): Outcome {
  const cumulative0 = probabilities[0];
  const cumulative1 = cumulative0 + probabilities[1];

  if (randomValue < cumulative0) {
    return "1"; // home win
  } else if (randomValue < cumulative1) {
    return "X"; // draw
  } else {
    return "2"; // away win
  }
}

/**
 * Converts a result string (0/1/2) to grid outcome notation (1/X/2)
 */
export function resultToOutcome(result: string): Outcome {
  switch (result) {
    case "0":
      return "1"; // home win
    case "1":
      return "X"; // draw
    case "2":
      return "2"; // away win
    default:
      throw new Error(`Invalid result: ${result}`);
  }
}

/**
 * Converts grid outcome notation (1/X/2) back to result string (0/1/2)
 */
export function outcomeToResult(outcome: Outcome): string {
  switch (outcome) {
    case "1":
      return "0"; // home win
    case "X":
      return "1"; // draw
    case "2":
      return "2"; // away win
    default:
      throw new Error(`Invalid outcome: ${outcome}`);
  }
}

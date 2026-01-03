import type {
  DataFileWithResult,
  GridBet,
  GridBetsResult,
  GridStrategyConfig,
  Outcome,
} from "../types";
import { DEFAULT_GRID_CELLS, GRID_MATCH_COUNT, selectBestMatches } from "../constants";
import { createSeededRandom } from "../utils/seededRandom";

export type FavoriteGridStrategyOptions = GridStrategyConfig & {
  /**
   * How strongly to favor the most likely outcome.
   * 0 = pure random, 1 = always pick favorite
   * Default: 0.7
   */
  favoriteBias?: number;
  /**
   * Maximum number of upsets (non-favorite picks) allowed per bet.
   * Default: 3 (for 3x3 grid)
   */
  maxUpsets?: number;
};

/**
 * Creates a mapping from grid positions to actual match indices
 * by selecting the best matches from all available.
 */
function createMatchMapping(
  dataFile: DataFileWithResult
): Map<number, number> {
  const selectedIndices = selectBestMatches(
    dataFile.probabilities,
    GRID_MATCH_COUNT
  );

  const mapping = new Map<number, number>();
  selectedIndices.forEach((matchIndex, gridPosition) => {
    mapping.set(gridPosition, matchIndex);
  });

  return mapping;
}

/**
 * Gets the most likely outcome (favorite) for a match.
 */
function getFavorite(probabilities: [number, number, number]): Outcome {
  const maxIndex = probabilities.indexOf(Math.max(...probabilities));
  return (["1", "X", "2"] as Outcome[])[maxIndex];
}

/**
 * Generates a single bet favoring the most likely outcomes.
 */
function generateFavoriteBiasedBet(
  dataFile: DataFileWithResult,
  random: () => number,
  favoriteBias: number,
  maxUpsets: number,
  matchMapping: Map<number, number>
): GridBet {
  const predictions: (Outcome | null)[] = [];
  let upsetCount = 0;

  for (const cell of DEFAULT_GRID_CELLS) {
    if (cell.isFree) {
      predictions.push(null);
      continue;
    }

    // Get the actual match index from the mapping
    const actualMatchIndex = matchMapping.get(cell.position);
    if (actualMatchIndex === undefined || actualMatchIndex === null) {
      predictions.push(null);
      continue;
    }

    // Bounds check - if matchIndex exceeds available probabilities, treat as free
    if (actualMatchIndex >= dataFile.probabilities.length) {
      predictions.push(null);
      continue;
    }

    const probs = dataFile.probabilities[actualMatchIndex];
    const favorite = getFavorite(probs);

    // Decide if we pick the favorite or allow an upset
    if (random() < favoriteBias || upsetCount >= maxUpsets) {
      predictions.push(favorite);
    } else {
      // Pick a non-favorite outcome
      const outcomes: Outcome[] = ["1", "X", "2"];
      const nonFavorites = outcomes.filter((o) => o !== favorite);
      const pick = nonFavorites[Math.floor(random() * nonFavorites.length)];
      predictions.push(pick);
      upsetCount++;
    }
  }

  return { predictions };
}

/**
 * Favorite-biased strategy for grid bets.
 * Tends to pick the most likely outcome but allows some upsets.
 * Automatically selects the best 9 matches from 13 available.
 */
export function favoriteGridStrategy(
  data: DataFileWithResult[],
  options: FavoriteGridStrategyOptions = {}
): GridBetsResult[] {
  const {
    betsCount = 50,
    seed,
    favoriteBias = 0.7,
    maxUpsets = 3,
  } = options;

  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const effectiveSeed = seed !== undefined ? seed + dateHash : dateHash;

    const random = createSeededRandom(effectiveSeed);

    // Create match mapping once per date
    const matchMapping = createMatchMapping(dataFile);

    const betsSet = new Set<string>();
    const bets: GridBet[] = [];

    let attempts = 0;
    const maxAttempts = betsCount * 10;

    while (bets.length < betsCount && attempts < maxAttempts) {
      const bet = generateFavoriteBiasedBet(
        dataFile,
        random,
        favoriteBias,
        maxUpsets,
        matchMapping
      );
      const betKey = bet.predictions.join(",");

      if (!betsSet.has(betKey)) {
        betsSet.add(betKey);
        bets.push(bet);
      }
      attempts++;
    }

    return {
      date: dataFile.date,
      bets,
    };
  });
}

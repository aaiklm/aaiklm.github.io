import type { DataFile, DataFileWithResult, Probability } from "../types";

function calculateProbabilities(odds: number[]): Probability[] {
  const probabilities: Probability[] = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([
      rawProbs[0] / sum,
      rawProbs[1] / sum,
      rawProbs[2] / sum,
    ]);
  }
  return probabilities;
}

const dataModules = import.meta.glob<{ default: DataFile }>(
  "../../assets/data/*.json",
  { eager: true }
);

const dataWithResults: DataFileWithResult[] = Object.entries(dataModules)
  .map(([path, module]) => {
    const data = module.default;
    const filename = path.split("/").pop()?.replace(".json", "") ?? "";
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : filename;
    const probabilities = calculateProbabilities(data.odds);
    return { ...data, date, probabilities };
  })
  .filter((item): item is DataFileWithResult => item.result !== undefined);

export function useTipsData() {
  return dataWithResults;
}

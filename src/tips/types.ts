export type Team = { "1": string; "2": string };

export type DataFile = {
  teams: Team[];
  odds: number[];
  matches?: unknown[];
  result?: string;
  penge?: Record<string, number>;
  fav?: number[];
  bets?: string[];
};

export type Probability = [number, number, number];

export type DataFileWithResult = DataFile & {
  result: string;
  date: string;
  probabilities: Probability[];
};

export type BetsResult = {
  /** The date of the data file */
  date: string;
  /** Generated bets for this data file */
  bets: string[];
};

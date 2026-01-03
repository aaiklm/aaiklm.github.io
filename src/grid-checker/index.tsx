import { useState, useMemo } from "react";
import styles from "./index.module.css";

// Import all data files
const dataModules = import.meta.glob<{
  default: {
    teams?: { "1": string; "2": string }[];
    odds: number[];
    result?: string;
    grid?: {
      selectedMatches: number[];
      picks: {
        position: number;
        matchIndex: number;
        homeTeam: string;
        awayTeam: string;
        pick: string;
      }[];
    };
    lines?: string[][];
    penge?: Record<string, number>;
  };
}>("../assets/data/*.json", { eager: true });

type DataFile = {
  filename: string;
  date: string;
  teams?: { "1": string; "2": string }[];
  odds: number[];
  result?: string;
  grid?: {
    selectedMatches: number[];
    picks: {
      position: number;
      matchIndex: number;
      homeTeam: string;
      awayTeam: string;
      pick: string;
    }[];
  };
  lines?: string[][];
  penge?: Record<string, number>;
};

// Load and filter files that have grid data
const dataFiles: DataFile[] = Object.entries(dataModules)
  .map(([path, module]) => {
    const data = module.default;
    const filename = path.split("/").pop() ?? "";
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : filename.replace(".json", "");
    return { ...data, filename, date };
  })
  .filter((d) => d.grid !== undefined)
  .sort((a, b) => b.date.localeCompare(a.date));

// Grid constants
const COL1 = [0, 3, 6];
const COL2 = [1, 4, 7];
const COL3 = [2, 5, 8];

// Generate all 27 lines
const STANDARD_LINES: { positions: number[] }[] = [];
for (const c1 of COL1) {
  for (const c2 of COL2) {
    for (const c3 of COL3) {
      STANDARD_LINES.push({ positions: [c1, c2, c3] });
    }
  }
}

// Convert result char to outcome
function resultToOutcome(resultChar: string): string {
  if (resultChar === "0") return "1";
  if (resultChar === "1") return "X";
  return "2";
}

export function GridChecker() {
  const [selectedFile, setSelectedFile] = useState<DataFile | null>(
    dataFiles[0] ?? null
  );
  const [inputFilename, setInputFilename] = useState("");

  // Track which cells are marked correct (user can toggle)
  const [correctCells, setCorrectCells] = useState<boolean[]>(() =>
    new Array(9).fill(false)
  );

  // Auto-detect correct cells from result when file changes
  const autoDetectedCorrect = useMemo(() => {
    if (!selectedFile?.grid || !selectedFile.result) {
      return new Array(9).fill(false);
    }

    return selectedFile.grid.picks.map((pick) => {
      const resultChar = selectedFile.result![pick.matchIndex];
      const actual = resultToOutcome(resultChar);
      return pick.pick === actual;
    });
  }, [selectedFile]);

  // Use auto-detected if available, otherwise use manual
  const effectiveCorrect = selectedFile?.result ? autoDetectedCorrect : correctCells;

  // Calculate correct lines and winnings
  const { correctLineCount, totalWinnings, correctLineDetails } = useMemo(() => {
    if (!selectedFile?.grid) {
      return { correctLineCount: 0, totalWinnings: 0, correctLineDetails: [] };
    }

    const details: { lineIdx: number; positions: number[]; payout: number }[] = [];
    let total = 0;

    STANDARD_LINES.forEach((line, lineIdx) => {
      const allCorrect = line.positions.every((pos) => effectiveCorrect[pos]);
      if (allCorrect) {
        // Calculate payout: product of odds for each pick in the line
        let payout = 1;
        for (const pos of line.positions) {
          const pick = selectedFile.grid!.picks[pos];
          const oddsIdx =
            pick.matchIndex * 3 +
            (pick.pick === "1" ? 0 : pick.pick === "X" ? 1 : 2);
          payout *= selectedFile.odds[oddsIdx];
        }
        details.push({ lineIdx, positions: line.positions, payout });
        total += payout;
      }
    });

    return {
      correctLineCount: details.length,
      totalWinnings: total,
      correctLineDetails: details,
    };
  }, [selectedFile, effectiveCorrect]);

  // Toggle cell correct/incorrect (only when no result to auto-detect)
  const toggleCell = (pos: number) => {
    if (selectedFile?.result) return; // Don't allow toggle when we have result
    setCorrectCells((prev) => {
      const next = [...prev];
      next[pos] = !next[pos];
      return next;
    });
  };

  // Handle file selection from dropdown
  const handleFileChange = (filename: string) => {
    const file = dataFiles.find((f) => f.filename === filename);
    setSelectedFile(file ?? null);
    setCorrectCells(new Array(9).fill(false));
    setInputFilename("");
  };

  // Handle filename input
  const handleFilenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputFilename.trim()) return;

    // Normalize the input - add .json if not present, try with/without test- prefix
    const normalized = inputFilename.trim().replace(/\.json$/, "");
    const candidates = [
      `${normalized}.json`,
      `test-${normalized}.json`,
      normalized,
    ];

    for (const candidate of candidates) {
      const file = dataFiles.find(
        (f) => f.filename === candidate || f.filename.includes(normalized)
      );
      if (file) {
        setSelectedFile(file);
        setCorrectCells(new Array(9).fill(false));
        setInputFilename("");
        return;
      }
    }

    // If not found in loaded files, show error
    alert(`File not found: ${normalized}\nMake sure the file has grid data (run: npm run add:lines -- ${normalized})`);
  };

  if (dataFiles.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.emptyState}>
          <h2>No Grid Data Available</h2>
          <p>Run the add:lines script on a data file first:</p>
          <code>npm run add:lines -- 2025-08-23</code>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>Grid Checker</h1>
        <div className={styles.fileControls}>
          <form onSubmit={handleFilenameSubmit} className={styles.filenameForm}>
            <input
              type="text"
              className={styles.filenameInput}
              placeholder="Enter date (e.g. 2025-08-23)"
              value={inputFilename}
              onChange={(e) => setInputFilename(e.target.value)}
            />
            <button type="submit" className={styles.loadButton}>
              Load
            </button>
          </form>
          <span className={styles.orDivider}>or</span>
          <select
            className={styles.fileSelect}
            value={selectedFile?.filename ?? ""}
            onChange={(e) => handleFileChange(e.target.value)}
          >
            {dataFiles.map((f) => (
              <option key={f.filename} value={f.filename}>
                {f.date} {f.result ? "✓" : "(no result)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedFile?.grid && (
        <>
          <div className={styles.mainContent}>
            {/* Grid Display */}
            <div className={styles.gridSection}>
              <h2 className={styles.sectionTitle}>3×3 Grid</h2>
              <div className={styles.grid}>
                {[0, 1, 2].map((row) => (
                  <div key={row} className={styles.gridRow}>
                    {[0, 1, 2].map((col) => {
                      const pos = row * 3 + col;
                      const pick = selectedFile.grid!.picks[pos];
                      const isCorrect = effectiveCorrect[pos];

                      return (
                        <div
                          key={pos}
                          className={`${styles.cell} ${
                            isCorrect ? styles.cellCorrect : styles.cellWrong
                          }`}
                          onClick={() => toggleCell(pos)}
                        >
                          <div className={styles.cellPosition}>
                            {pos}
                          </div>
                          <div className={styles.cellMatch}>
                            <span className={styles.homeTeam}>
                              {pick.homeTeam}
                            </span>
                            <span className={styles.vs}>vs</span>
                            <span className={styles.awayTeam}>
                              {pick.awayTeam}
                            </span>
                          </div>
                          <div className={styles.cellPick}>
                            Pick: <strong>{pick.pick}</strong>
                            {pick.pick === "1" && ` (${pick.homeTeam})`}
                            {pick.pick === "2" && ` (${pick.awayTeam})`}
                            {pick.pick === "X" && " (Draw)"}
                          </div>
                          {selectedFile.result && (
                            <div className={styles.cellActual}>
                              Actual:{" "}
                              <strong>
                                {resultToOutcome(
                                  selectedFile.result[pick.matchIndex]
                                )}
                              </strong>
                            </div>
                          )}
                          <div className={styles.cellStatus}>
                            {isCorrect ? "✅" : "❌"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {!selectedFile.result && (
                <p className={styles.hint}>
                  Click cells to toggle correct/incorrect
                </p>
              )}
            </div>

            {/* Results Summary */}
            <div className={styles.resultsSection}>
              <h2 className={styles.sectionTitle}>Results</h2>

              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Correct Picks</div>
                  <div className={styles.statValue}>
                    {effectiveCorrect.filter(Boolean).length}/9
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Correct Lines</div>
                  <div className={styles.statValue}>
                    {correctLineCount}/27
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Cost (27 lines)</div>
                  <div className={styles.statValue}>27 kr</div>
                </div>
                <div
                  className={`${styles.statCard} ${
                    totalWinnings - 27 > 0 ? styles.statPositive : styles.statNegative
                  }`}
                >
                  <div className={styles.statLabel}>Winnings</div>
                  <div className={styles.statValue}>
                    {totalWinnings.toFixed(1)} kr
                  </div>
                </div>
                <div
                  className={`${styles.statCard} ${styles.statLarge} ${
                    totalWinnings - 27 > 0 ? styles.statPositive : styles.statNegative
                  }`}
                >
                  <div className={styles.statLabel}>Profit</div>
                  <div className={styles.statValue}>
                    {totalWinnings - 27 > 0 ? "+" : ""}
                    {(totalWinnings - 27).toFixed(1)} kr
                  </div>
                </div>
              </div>

              {/* Payout reference from file */}
              {selectedFile.penge && Object.keys(selectedFile.penge).length > 0 && (
                <div className={styles.payoutReference}>
                  <h3 className={styles.subTitle}>Official Payouts</h3>
                  <div className={styles.payoutGrid}>
                    {Object.entries(selectedFile.penge).map(([key, value]) => (
                      <div key={key} className={styles.payoutItem}>
                        <span>{key} correct:</span>
                        <strong>{value} kr</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correct Lines List */}
              {correctLineCount > 0 && (
                <div className={styles.linesSection}>
                  <h3 className={styles.subTitle}>
                    Correct Lines ({correctLineCount})
                  </h3>
                  <div className={styles.linesList}>
                    {correctLineDetails.map(({ lineIdx, positions, payout }) => (
                      <div key={lineIdx} className={styles.lineItem}>
                        <span className={styles.linePath}>
                          {positions.join(" → ")}
                        </span>
                        <span className={styles.linePayout}>
                          {payout.toFixed(2)} kr
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


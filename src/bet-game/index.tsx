import { useState, useMemo, useCallback } from "react";
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
};

// Load and filter files that have grid data, sorted newest first
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

// Convert result char to outcome
function resultToOutcome(resultChar: string): string {
  if (resultChar === "0") return "1";
  if (resultChar === "1") return "X";
  return "2";
}

// Grid column positions for 27-line calculation
const COL1 = [0, 3, 6];
const COL2 = [1, 4, 7];
const COL3 = [2, 5, 8];

// Generate all 27 lines (3×3×3 combinations)
const STANDARD_LINES: number[][] = [];
for (const c1 of COL1) {
  for (const c2 of COL2) {
    for (const c3 of COL3) {
      STANDARD_LINES.push([c1, c2, c3]);
    }
  }
}

export function BetGame() {
  // Default to newest file
  const [selectedFile, setSelectedFile] = useState<DataFile | null>(
    dataFiles[0] ?? null
  );

  // Manual results input - can be updated anytime
  const [manualResults, setManualResults] = useState<Record<number, string>>(
    {}
  );

  // Get the actual outcome for a match
  const getOutcome = useCallback(
    (matchIndex: number): string | null => {
      // Manual results take priority (allows overriding file results for testing)
      if (manualResults[matchIndex]) {
        return manualResults[matchIndex];
      }
      if (selectedFile?.result) {
        return resultToOutcome(selectedFile.result[matchIndex]);
      }
      return null;
    },
    [selectedFile?.result, manualResults]
  );

  // Toggle result for a match (cycles: none → 1 → X → 2 → none)
  const cycleResult = useCallback((matchIndex: number) => {
    setManualResults((prev) => {
      const current = prev[matchIndex];
      if (!current) return { ...prev, [matchIndex]: "1" };
      if (current === "1") return { ...prev, [matchIndex]: "X" };
      if (current === "X") return { ...prev, [matchIndex]: "2" };
      // Remove the result (back to pending)
      const next = { ...prev };
      delete next[matchIndex];
      return next;
    });
  }, []);

  // Set specific result
  const setResult = useCallback((matchIndex: number, result: string | null) => {
    setManualResults((prev) => {
      if (result === null) {
        const next = { ...prev };
        delete next[matchIndex];
        return next;
      }
      return { ...prev, [matchIndex]: result };
    });
  }, []);

  // Build array of pick correctness for each grid position
  const pickStatus = useMemo(() => {
    if (!selectedFile?.grid) return new Array(9).fill(null);
    return selectedFile.grid.picks.map((pick) => {
      const outcome = getOutcome(pick.matchIndex);
      if (outcome === null) return null; // pending
      return pick.pick === outcome; // true = correct, false = wrong
    });
  }, [selectedFile?.grid, getOutcome]);

  // Calculate line status and potential payout for all 27 lines
  const lineStatus = useMemo(() => {
    if (!selectedFile?.grid) return [];
    
    return STANDARD_LINES.map((positions) => {
      const statuses = positions.map((pos) => pickStatus[pos]);
      const correctCount = statuses.filter((s) => s === true).length;
      const wrongCount = statuses.filter((s) => s === false).length;
      const pendingCount = statuses.filter((s) => s === null).length;

      // Calculate potential payout for this line
      let payout = 1;
      for (const pos of positions) {
        const pick = selectedFile.grid!.picks[pos];
        const oddsIdx =
          pick.matchIndex * 3 +
          (pick.pick === "1" ? 0 : pick.pick === "X" ? 1 : 2);
        payout *= selectedFile.odds[oddsIdx];
      }

      if (wrongCount > 0) return { status: "dead" as const, correctCount, pendingCount, payout };
      if (pendingCount === 0) return { status: "won" as const, correctCount, pendingCount, payout };
      return { status: "alive" as const, correctCount, pendingCount, payout };
    });
  }, [pickStatus, selectedFile]);

  // Calculate winnings
  const { wonLines, totalWinnings, aliveLines } = useMemo(() => {
    if (!selectedFile?.grid) {
      return { wonLines: 0, totalWinnings: 0, aliveLines: 0 };
    }

    let won = 0;
    let alive = 0;
    let total = 0;

    STANDARD_LINES.forEach((positions, idx) => {
      const status = lineStatus[idx];
      if (status.status === "won") {
        won++;
        // Calculate payout for this line
        let payout = 1;
        for (const pos of positions) {
          const pick = selectedFile.grid!.picks[pos];
          const oddsIdx =
            pick.matchIndex * 3 +
            (pick.pick === "1" ? 0 : pick.pick === "X" ? 1 : 2);
          payout *= selectedFile.odds[oddsIdx];
        }
        total += payout;
      } else if (status.status === "alive") {
        alive++;
      }
    });

    return { wonLines: won, totalWinnings: total, aliveLines: alive };
  }, [selectedFile, lineStatus]);

  // Reset manual results
  const resetGame = useCallback(() => {
    setManualResults({});
  }, []);

  // File navigation
  const navigateFile = useCallback(
    (direction: "prev" | "next") => {
      const currentIndex = dataFiles.findIndex(
        (f) => f.filename === selectedFile?.filename
      );
      let newIndex = direction === "prev" ? currentIndex + 1 : currentIndex - 1;
      if (newIndex < 0) newIndex = dataFiles.length - 1;
      if (newIndex >= dataFiles.length) newIndex = 0;
      setSelectedFile(dataFiles[newIndex]);
      setManualResults({});
    },
    [selectedFile?.filename]
  );

  if (dataFiles.length === 0 || !selectedFile?.grid) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <h2>No Bets Available</h2>
          <p>Run the add:lines script to generate bets</p>
        </div>
      </div>
    );
  }

  const picks = selectedFile.grid.picks;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.dateNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateFile("prev")}
          >
            ←
          </button>
          <div className={styles.dateDisplay}>
            <span className={styles.dateValue}>{selectedFile.date}</span>
          </div>
          <button
            className={styles.navButton}
            onClick={() => navigateFile("next")}
          >
            →
          </button>
        </div>
        {Object.keys(manualResults).length > 0 && (
          <button className={styles.resetBtn} onClick={resetGame}>
            Reset
          </button>
        )}
      </header>

      {/* 3x3 Grid */}
      <div className={styles.gridContainer}>
        <div className={styles.grid}>
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.gridRow}>
              {[0, 1, 2].map((col) => {
                const pos = row * 3 + col;
                const pick = picks[pos];
                const outcome = getOutcome(pick.matchIndex);
                const status = pickStatus[pos];

                return (
                  <div
                    key={pos}
                    className={`${styles.gridCell} ${
                      status === true
                        ? styles.cellCorrect
                        : status === false
                          ? styles.cellWrong
                          : styles.cellPending
                    }`}
                  >
                    <div className={styles.cellTeams}>
                      <span className={styles.teamName}>{pick.homeTeam}</span>
                      <span className={styles.teamVs}>vs</span>
                      <span className={styles.teamName}>{pick.awayTeam}</span>
                    </div>

                    <div className={styles.cellBet}>
                      <span className={styles.betLabel}>Bet:</span>
                      <span
                        className={`${styles.betValue} ${
                          pick.pick === "1"
                            ? styles.betHome
                            : pick.pick === "2"
                              ? styles.betAway
                              : styles.betDraw
                        }`}
                      >
                        {pick.pick}
                      </span>
                    </div>

                    {/* Result selector */}
                    <div className={styles.resultSelector}>
                      {["1", "X", "2"].map((r) => (
                        <button
                          key={r}
                          className={`${styles.resultBtn} ${
                            outcome === r ? styles.resultBtnActive : ""
                          } ${
                            outcome === r && pick.pick === r
                              ? styles.resultBtnCorrect
                              : outcome === r && pick.pick !== r
                                ? styles.resultBtnWrong
                                : ""
                          }`}
                          onClick={() =>
                            setResult(pick.matchIndex, outcome === r ? null : r)
                          }
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Column labels */}
        <div className={styles.columnLabels}>
          <span>Col 1</span>
          <span>Col 2</span>
          <span>Col 3</span>
        </div>
      </div>

      {/* Lines as Routes */}
      <div className={styles.linesSection}>
        <div className={styles.linesHeader}>
          <span className={styles.linesTitle}>27 Lines</span>
          <span className={styles.linesCount}>
            <span className={styles.wonColor}>{wonLines} won</span>
            {aliveLines > 0 && (
              <span className={styles.aliveColor}> · {aliveLines} alive</span>
            )}
          </span>
        </div>

        <div className={styles.linesList}>
          {STANDARD_LINES.map((positions, idx) => {
            const status = lineStatus[idx];
            if (!status) return null;
            return (
              <div
                key={idx}
                className={`${styles.lineRoute} ${
                  status.status === "won"
                    ? styles.lineRouteWon
                    : status.status === "alive"
                      ? styles.lineRouteAlive
                      : styles.lineRouteDead
                }`}
              >
                <div className={styles.lineNodes}>
                  {positions.map((pos, i) => (
                    <span key={pos} className={styles.lineNode}>
                      <span
                        className={`${styles.nodeBox} ${
                          pickStatus[pos] === true
                            ? styles.nodeCorrect
                            : pickStatus[pos] === false
                              ? styles.nodeWrong
                              : styles.nodePending
                        }`}
                      >
                        {pos}
                      </span>
                      {i < 2 && <span className={styles.nodeArrow}>→</span>}
                    </span>
                  ))}
                </div>
                <span className={styles.linePayout}>
                  {status.payout.toFixed(0)}kr
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Winnings */}
      {wonLines > 0 && (
        <div className={styles.winningsBar}>
          <span className={styles.winningsLabel}>Winnings</span>
          <span className={styles.winningsValue}>
            {totalWinnings.toFixed(0)} kr
          </span>
        </div>
      )}
    </div>
  );
}

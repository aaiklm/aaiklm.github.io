import { useEffect, useState, useCallback } from "react";
import styles from "./index.module.css";
import { useTipsData } from "./hooks/useTipsDataWithResult";
import { useRandomBetsStrategy } from "./hooks/strategies/useRandomBetsStrategy";
import { calculateBetsAccuracy } from "./utils/calculateBetsAccuracy";
import { AccuracyChart } from "./components/AccuracyChart";

const BETS_COUNT = 75;

const CHARTS = [
  { id: 0, title: "Random strategy accuracy #1" },
  { id: 1, title: "Random strategy accuracy #2" },
];

export function Tips() {
  const data = useTipsData();
  const bets = useRandomBetsStrategy({ data, count: BETS_COUNT });
  const betsAccuracy = calculateBetsAccuracy(data, bets);

  const bets2 = useRandomBetsStrategy({ data, count: BETS_COUNT, seed: 1 });
  const betsAccuracy2 = calculateBetsAccuracy(data, bets2);

  // Default to the last chart (index = CHARTS.length - 1)
  const [activeIndex, setActiveIndex] = useState(CHARTS.length - 1);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "ArrowRight") {
      setActiveIndex((prev) => Math.min(CHARTS.length - 1, prev + 1));
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const activeChart = CHARTS[activeIndex];
  const activeBets = activeIndex === 0 ? betsAccuracy : betsAccuracy2;

  return (
    <div className={styles.wrapper}>
      <div className={styles.navigation}>
        <span className={styles.navHint}>← → to navigate</span>
        <span className={styles.navIndicator}>
          {CHARTS.map((chart, i) => (
            <span
              key={chart.id}
              className={`${styles.dot} ${
                i === activeIndex ? styles.dotActive : ""
              }`}
            />
          ))}
        </span>
      </div>
      <div className={styles.chartsContainer}>
        <AccuracyChart data={activeBets} title={activeChart.title} />
      </div>
    </div>
  );
}

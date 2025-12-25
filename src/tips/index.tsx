import { useEffect, useState, useCallback, useMemo } from "react";
import styles from "./index.module.css";
import { useTipsData } from "./hooks/useTipsDataWithResult";
import { calculateBetsAccuracy } from "./utils/calculateBetsAccuracy";
import { AccuracyChart } from "./components/AccuracyChart";
import { randomBetsStrategy } from "./strategies/randomBetsStrategy";
import type { BetsResult, DataFileWithResult } from "./types";
import { lockInFavorite } from "./strategies/lockInFavorite";
import { outcomeIsUndervalued } from "./strategies/outcomeIsUndervalued";
import { drawHunter } from "./strategies/drawHunter";

const BETS_COUNT = 75;

type ChartConfig = {
  id: number;
  title: string;
  generateBets: (data: DataFileWithResult[]) => BetsResult[];
};

const CHARTS: ChartConfig[] = [
  {
    id: 0,
    title: "Random strategy accuracy #1",
    generateBets: (data) => randomBetsStrategy({ data, count: BETS_COUNT }),
  },
  {
    id: 1,
    title: "Away is undervalued strategy accuracy",
    generateBets: (data) => {
      let biasedData = lockInFavorite({
        data,
        threshold: 2.2,
      });
      biasedData = outcomeIsUndervalued({
        data: biasedData,
        outcome: "away",
        bias: 0.1,
      });
      return randomBetsStrategy({
        data: biasedData,
        count: BETS_COUNT,
      });
    },
  },
  {
    id: 2,
    title: "Test strategy",
    generateBets: (data) => {
      let biasedData = lockInFavorite({
        data,
        threshold: 2.2,
      });

      biasedData = outcomeIsUndervalued({
        data: biasedData,
        outcome: "away",
        bias: 0.1,
      });

      // Option 1: Draw Hunter - biases towards draws (historically undervalued)
      biasedData = drawHunter({
        data: biasedData,
        drawBias: 0.7, // Tweak: 0.0-1.0, higher = more draws
        evenMatchThreshold: 1, // Tweak: lower = only apply to close matches
      });

      return randomBetsStrategy({
        data: biasedData,
        count: BETS_COUNT,
      });
    },
  },
];

export function Tips() {
  const data = useTipsData();

  const chartData = useMemo(
    () =>
      CHARTS.map((chart) => ({
        ...chart,
        accuracy: calculateBetsAccuracy(data, chart.generateBets(data)),
      })),
    [data]
  );

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

  const activeChart = chartData[activeIndex];

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
        <AccuracyChart data={activeChart.accuracy} title={activeChart.title} />
      </div>
    </div>
  );
}

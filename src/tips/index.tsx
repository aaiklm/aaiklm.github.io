import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import styles from "./index.module.css";
import { useTipsData } from "./hooks/useTipsDataWithResult";
import { calculateBetsAccuracy } from "./utils/calculateBetsAccuracy";
import { AccuracyChart } from "./components/AccuracyChart";
import {
  randomBetsStrategy,
  limitedUnderdogBetsStrategy,
} from "./strategies/randomBetsStrategy";
import type { BetsResult, DataFileWithResult } from "./types";
import { lockInFavorite } from "./strategies/lockInFavorite";
import { outcomeIsUndervalued } from "./strategies/outcomeIsUndervalued";
import { drawHunter } from "./strategies/drawHunter";
import { formMomentum, allTeamData } from "./strategies/formMomentum";
import { drawPropensity } from "./strategies/drawPropensity";

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
  {
    id: 3,
    title: "Form Momentum (streaks matter)",
    generateBets: (data) => {
      let biasedData = data;

      biasedData = lockInFavorite({
        data,
        threshold: 2.2,
      });

      biasedData = outcomeIsUndervalued({
        data: biasedData,
        outcome: "away",
        bias: 0.1,
      });

      biasedData = formMomentum({
        data: biasedData,
        teamData: allTeamData,
        formFactor: 2.8,
      });

      return randomBetsStrategy({
        data: biasedData,
        count: BETS_COUNT,
      });
    },
  },
  {
    id: 4,
    title: "Form Momentum + Draw Propensity",
    generateBets: (data) => {
      let biasedData = data;

      biasedData = lockInFavorite({
        data,
        threshold: 2.1,
      });

      biasedData = outcomeIsUndervalued({
        data: biasedData,
        outcome: "away",
        bias: 0.7,
      });

      biasedData = drawPropensity({
        data: biasedData,
        teamData: allTeamData,
        drawBiasFactor: 5, // Multiplier on draw rate deviation
        minMatchesRequired: 5, // Need enough matches to trust pattern
        matchWindow: 10, // Look at last N matches
      });

      biasedData = formMomentum({
        data: biasedData,
        teamData: allTeamData,
        formFactor: 3,
      });

      return randomBetsStrategy({
        data: biasedData,
        count: BETS_COUNT,
      });
    },
  },
  {
    id: 5,
    title: "Fine tune plus",
    generateBets: (data) => {
      let biasedData = data;

      biasedData = lockInFavorite({
        data,
        threshold: 2.1,
      });

      biasedData = outcomeIsUndervalued({
        data: biasedData,
        outcome: "away",
        bias: 0.7,
      });

      biasedData = drawPropensity({
        data: biasedData,
        teamData: allTeamData,
        drawBiasFactor: 5, // Multiplier on draw rate deviation
        minMatchesRequired: 5, // Need enough matches to trust pattern
        matchWindow: 10, // Look at last N matches
      });

      biasedData = formMomentum({
        data: biasedData,
        teamData: allTeamData,
        formFactor: 3,
      });

      return limitedUnderdogBetsStrategy({
        data: biasedData,
        count: BETS_COUNT,
        maxUnderdogPicks: 5, // Max 3 underdog picks per bet
        underdogOddsThreshold: 2.2, // Odds >= 4 = underdog
      });
    },
  },
];

type CachedChartData = {
  id: number;
  title: string;
  accuracy: ReturnType<typeof calculateBetsAccuracy>;
};

export function Tips() {
  const data = useTipsData();

  // Cache for lazily computed chart data - reset when data changes
  const chartCacheRef = useRef<Map<number, CachedChartData>>(new Map());
  const lastDataRef = useRef(data);

  // Reset cache if data changes
  if (lastDataRef.current !== data) {
    chartCacheRef.current = new Map();
    lastDataRef.current = data;
  }

  // Default to the last chart (index = CHARTS.length - 1)
  const [activeIndex, setActiveIndex] = useState(CHARTS.length - 1);

  // Lazily compute chart data only when needed
  const activeChart = useMemo(() => {
    const chart = CHARTS[activeIndex];
    const cached = chartCacheRef.current.get(chart.id);

    if (cached) {
      return cached;
    }

    // Compute only for this chart
    const computed: CachedChartData = {
      id: chart.id,
      title: chart.title,
      accuracy: calculateBetsAccuracy(data, chart.generateBets(data)),
    };

    chartCacheRef.current.set(chart.id, computed);
    return computed;
  }, [activeIndex, data]);

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
        <AccuracyChart
          data={activeChart.accuracy}
          title={activeChart.title}
          // excludeTopWinner={false}
        />
      </div>
    </div>
  );
}

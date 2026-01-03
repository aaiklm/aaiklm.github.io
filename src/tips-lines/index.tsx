import { useMemo, useRef, useState } from "react";
import styles from "./index.module.css";
import { useTipsLinesData } from "./hooks/useTipsLinesData";
import {
  calculateGridAccuracy,
  summarizeAccuracy,
} from "./utils/calculateGridAccuracy";
import {
  randomGridStrategy,
  simpleFavoriteStrategy,
  ultraConservativeStrategy,
  homeBiasStrategy,
  pureFavoriteStrategy,
  valueEdgeConservative,
  teamIntelligenceStrategy,
} from "./strategies";
import { optimalTeamIntelligence } from "./ml-strategy/team-intelligence";
import { STANDARD_LINES } from "./constants";
import type {
  DataFileWithResult,
  GridAccuracyResult,
  GridBetsResult,
} from "./types";

const BETS_COUNT = 50;

type StrategyConfig = {
  id: string;
  name: string;
  generateBets: (data: DataFileWithResult[]) => GridBetsResult[];
  description?: string;
};

const STRATEGIES: StrategyConfig[] = [
  // 🎯 NEW SIMPLE STRATEGIES - Trust the odds, no complexity!
  {
    id: "pure-favorite",
    name: "🎲 Pure Favorite",
    generateBets: (data) =>
      pureFavoriteStrategy(data, { betsCount: BETS_COUNT }),
    description: "ZERO variance - always picks the favorite",
  },
  {
    id: "simple-favorite",
    name: "🎯 No Draw",
    generateBets: (data) =>
      simpleFavoriteStrategy(data, { betsCount: BETS_COUNT }),
    description: "Never draws, home boost, only home/away",
  },
  {
    id: "ultra-conservative",
    name: "🔒 Ultra Safe",
    generateBets: (data) =>
      ultraConservativeStrategy(data, { betsCount: BETS_COUNT }),
    description: "Minimal variance, strong home bias",
  },
  {
    id: "team-intelligence",
    name: "📊 Team Data",
    generateBets: (data) =>
      teamIntelligenceStrategy(data, { betsCount: BETS_COUNT }),
    description: "Uses club match history & form",
  },
  {
    id: "home-bias",
    name: "🏠 Home Bias",
    generateBets: (data) => homeBiasStrategy(data, { betsCount: BETS_COUNT }),
    description: "2.5x home boost, never draws",
  },
  // Previous strategies for comparison
  {
    id: "value-edge-conservative",
    name: "💎 Value Edge",
    generateBets: (data) =>
      valueEdgeConservative(data, { betsCount: BETS_COUNT }),
    description: "Previous best approach",
  },
  {
    id: "team-optimal",
    name: "🧠 Team Intel",
    generateBets: (data) =>
      optimalTeamIntelligence(data, { betsCount: BETS_COUNT }),
    description: "Uses team form & venue stats",
  },
  // Baseline for comparison
  {
    id: "random",
    name: "📊 Random",
    generateBets: (data) => randomGridStrategy(data, { betsCount: BETS_COUNT }),
    description: "Probability-weighted random",
  },
];

type CachedStrategyData = {
  accuracy: GridAccuracyResult[];
  summary: ReturnType<typeof summarizeAccuracy>;
};

export function TipsLines() {
  const data = useTipsLinesData();
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(
    null
  );

  // Cache for lazily computed strategy data - compute all at once
  const cacheRef = useRef<Map<string, CachedStrategyData>>(new Map());
  const lastDataRef = useRef(data);

  // Reset cache if data changes
  if (lastDataRef.current !== data) {
    cacheRef.current = new Map();
    lastDataRef.current = data;
  }

  // Compute data for all strategies
  const allStrategiesData = useMemo(() => {
    if (data.length === 0) {
      return STRATEGIES.map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        accuracy: [] as GridAccuracyResult[],
        summary: {
          totalBets: 0,
          totalWinnings: 0,
          totalCost: 0,
          profit: 0,
          roi: 0,
          avgWinningsPerBet: 0,
          avgCostPerBet: 0,
          avgProfitPerBet: 0,
          lineHitsDistribution: [],
          bestOverallBet: null,
          profitableDates: 0,
          totalDates: 0,
          totalMaxPossibleWinnings: 0,
        },
      }));
    }

    return STRATEGIES.map((strategy) => {
      const cached = cacheRef.current.get(strategy.id);
      if (cached) {
        return {
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          ...cached,
        };
      }

      const bets = strategy.generateBets(data);
      const accuracy = calculateGridAccuracy(data, bets);
      const summary = summarizeAccuracy(accuracy);

      cacheRef.current.set(strategy.id, { accuracy, summary });
      return {
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        accuracy,
        summary,
      };
    });
  }, [data]);

  // Find best strategy by ROI
  const bestStrategy = useMemo(() => {
    return allStrategiesData.reduce((best, current) =>
      current.summary.roi > best.summary.roi ? current : best
    );
  }, [allStrategiesData]);

  // Find baseline (random)
  const baselineStrategy = useMemo(() => {
    return (
      allStrategiesData.find((s) => s.id === "random") ||
      allStrategiesData[allStrategiesData.length - 1]
    );
  }, [allStrategiesData]);

  // Selected strategy (fallback to best)
  const selectedStrategy = useMemo(() => {
    if (selectedStrategyId) {
      const found = allStrategiesData.find((s) => s.id === selectedStrategyId);
      if (found) return found;
    }
    return bestStrategy;
  }, [selectedStrategyId, allStrategiesData, bestStrategy]);

  // Calculate line hit percentages across all strategies
  const maxLineHits = useMemo(() => {
    let max = 1;
    for (const s of allStrategiesData) {
      const strategyMax = Math.max(...(s.summary.lineHitsDistribution || [0]));
      if (strategyMax > max) max = strategyMax;
    }
    return max;
  }, [allStrategiesData]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tips Lines · ML Strategy Comparison</h1>
        <div className={styles.headerStats}>
          <span className={styles.headerStat}>
            {data.length} rounds · {BETS_COUNT} bets/round ·{" "}
            {STANDARD_LINES.length} lines/bet
          </span>
        </div>
      </div>

      {/* Strategy Insight Box */}
      <div
        style={{
          background: "linear-gradient(135deg, #1a2020 0%, #0d1515 100%)",
          border: "1px solid #2a3a3a",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            color: "#60a5fa",
            marginBottom: "8px",
          }}
        >
          🎯 Simple Favorite Strategy - Trust the Odds
        </div>
        <div style={{ fontSize: "13px", color: "#a3a3a3", lineHeight: 1.5 }}>
          <strong>Philosophy:</strong> Trust the odds when they're good. Pick
          favorites, boost home wins, penalize draws. The simpler the approach,
          the better.
          <br />
          <br />
          <strong>Key insight:</strong> In grid betting you need ALL 3
          predictions in a line correct. Picking favorites maximizes line
          probability.
        </div>
      </div>

      {/* Strategy Comparison Table */}
      <div className={styles.comparisonSection}>
        <div className={styles.sectionTitle}>Strategy Performance Overview</div>
        <div className={styles.comparisonTable}>
          <div className={styles.tableHeader}>
            <div className={styles.tableCell}>Strategy</div>
            <div className={styles.tableCell}>Total Bets</div>
            <div className={styles.tableCell}>Total Cost</div>
            <div className={styles.tableCell}>Total Winnings</div>
            <div className={styles.tableCell}>Profit</div>
            <div className={styles.tableCell}>ROI</div>
            <div className={styles.tableCell}>Profitable Days</div>
            <div className={styles.tableCell}>vs Baseline</div>
          </div>
          {allStrategiesData.map((s) => {
            const improvement = s.summary.roi - baselineStrategy.summary.roi;
            return (
              <div
                key={s.id}
                className={`${styles.tableRow} ${
                  s.id === bestStrategy.id ? styles.tableRowBest : ""
                } ${
                  s.id === selectedStrategy.id ? styles.tableRowSelected : ""
                }`}
                onClick={() => setSelectedStrategyId(s.id)}
              >
                <div className={styles.tableCell}>
                  <span className={styles.strategyName}>{s.name}</span>
                  {s.id === bestStrategy.id && (
                    <span className={styles.bestBadge}>BEST</span>
                  )}
                  {s.id === selectedStrategy.id && (
                    <span className={styles.selectedBadge}>VIEWING</span>
                  )}
                </div>
                <div className={styles.tableCell}>
                  {s.summary.totalBets.toLocaleString()}
                </div>
                <div className={styles.tableCell}>
                  {s.summary.totalCost.toLocaleString()}
                </div>
                <div className={styles.tableCell}>
                  {s.summary.totalWinnings.toFixed(1)}
                </div>
                <div
                  className={`${styles.tableCell} ${
                    s.summary.profit >= 0 ? styles.positive : styles.negative
                  }`}
                >
                  {s.summary.profit >= 0 ? "+" : ""}
                  {s.summary.profit.toFixed(1)}
                </div>
                <div
                  className={`${styles.tableCell} ${
                    s.summary.roi >= 0 ? styles.positive : styles.negative
                  }`}
                >
                  {s.summary.roi >= 0 ? "+" : ""}
                  {s.summary.roi.toFixed(1)}%
                </div>
                <div className={styles.tableCell}>
                  {s.summary.profitableDates} / {s.summary.totalDates}
                </div>
                <div
                  className={`${styles.tableCell} ${
                    improvement >= 0 ? styles.positive : styles.negative
                  }`}
                >
                  {s.id === "random" ? (
                    "—"
                  ) : (
                    <>
                      {improvement >= 0 ? "+" : ""}
                      {improvement.toFixed(1)}pp
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Line Hits Distribution Comparison */}
      <div className={styles.chartsGrid}>
        {allStrategiesData.map((s) => (
          <div key={s.id} className={styles.chartCard}>
            <div className={styles.chartTitle}>
              {s.name}
              <span
                className={`${styles.chartSubtitle} ${
                  s.summary.roi >= 0 ? styles.positive : styles.negative
                }`}
              >
                ROI: {s.summary.roi >= 0 ? "+" : ""}
                {s.summary.roi.toFixed(1)}%
              </span>
            </div>
            <div className={styles.barChart}>
              {(s.summary.lineHitsDistribution || []).map(
                (count, lineCount) => {
                  const height = Math.max((count / maxLineHits) * 100, 0);
                  const percentage =
                    s.summary.totalBets > 0
                      ? ((count / s.summary.totalBets) * 100).toFixed(1)
                      : "0";
                  return (
                    <div key={lineCount} className={styles.barGroup}>
                      <div className={styles.barWrapper}>
                        {count > 0 && (
                          <span className={styles.barValue}>{percentage}%</span>
                        )}
                        <div
                          className={`${styles.bar} ${
                            lineCount >= 3 ? styles.barHighlight : ""
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className={styles.barLabel}>{lineCount}</span>
                    </div>
                  );
                }
              )}
            </div>
            <div className={styles.chartFooter}>
              <span>Lines correct →</span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className={styles.summarySection}>
        <div className={styles.sectionTitle}>Key Insights</div>
        <div className={styles.insightsGrid}>
          <div className={styles.insightCard}>
            <div className={styles.insightLabel}>Best Strategy</div>
            <div className={styles.insightValue}>{bestStrategy.name}</div>
            <div className={styles.insightDetail}>
              ROI: {bestStrategy.summary.roi >= 0 ? "+" : ""}
              {bestStrategy.summary.roi.toFixed(2)}%
            </div>
          </div>
          <div className={styles.insightCard}>
            <div className={styles.insightLabel}>Improvement vs Random</div>
            <div className={styles.insightValue} style={{ color: "#4ade80" }}>
              +
              {(
                bestStrategy.summary.roi - baselineStrategy.summary.roi
              ).toFixed(1)}
              pp
            </div>
            <div className={styles.insightDetail}>
              {(
                ((bestStrategy.summary.roi - baselineStrategy.summary.roi) /
                  Math.abs(baselineStrategy.summary.roi)) *
                100
              ).toFixed(0)}
              % better
            </div>
          </div>
          <div className={styles.insightCard}>
            <div className={styles.insightLabel}>Total Rounds Tested</div>
            <div className={styles.insightValue}>{data.length}</div>
            <div className={styles.insightDetail}>
              {data.length > 0
                ? `${data[data.length - 1]?.date} → ${data[0]?.date}`
                : "No data"}
            </div>
          </div>
          <div className={styles.insightCard}>
            <div className={styles.insightLabel}>Best Single Bet</div>
            <div className={styles.insightValue}>
              {bestStrategy.summary.bestOverallBet?.correctLines.length ?? 0}{" "}
              lines
            </div>
            <div className={styles.insightDetail}>
              Won:{" "}
              {bestStrategy.summary.bestOverallBet?.winnings.toFixed(1) ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Per-Round Breakdown */}
      <div className={styles.breakdownSection}>
        <div className={styles.sectionTitle}>
          Per-Round Results ({selectedStrategy.name}) ·{" "}
          {selectedStrategy.accuracy.length} rounds · Sorted by winnings
        </div>
        <div className={styles.breakdownList}>
          {[...selectedStrategy.accuracy]
            .sort((a, b) => b.totalWinnings - a.totalWinnings)
            .map((result) => (
              <div key={result.date} className={styles.breakdownItem}>
                <span className={styles.breakdownDate}>{result.date}</span>
                <span className={styles.breakdownBets}>
                  {result.totalBets} bets
                </span>
                <span className={styles.breakdownCost}>
                  Cost: {result.totalCost}
                </span>
                <span className={styles.breakdownWinnings}>
                  Won: {result.totalWinnings.toFixed(1)}
                </span>
                <span
                  className={`${styles.breakdownProfit} ${
                    result.profit >= 0 ? styles.positive : styles.negative
                  }`}
                >
                  {result.profit >= 0 ? "+" : ""}
                  {result.profit.toFixed(1)}
                </span>
                <span className={styles.breakdownLines}>
                  Best: {result.bestBet?.correctLines.length ?? 0} lines
                </span>
                <span className={styles.breakdownMaxPossible}>
                  Max:{" "}
                  {result.maxPossibleWinnings.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

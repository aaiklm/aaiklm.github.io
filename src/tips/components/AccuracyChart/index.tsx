import type { AccuracyResult } from "../../utils/calculateBetsAccuracy";
import styles from "./index.module.css";

/** The minimum number of correct predictions needed to win */
const WINNING_THRESHOLD = 10;

type AccuracyChartProps = {
  data: AccuracyResult[];
  title: string;
  /** Number of top-winning dates to exclude to avoid data skew (default: 1) */
  excludeTopWinners?: number;
};

/** Logarithmic scale parameters */
const MIN_LOG = 0; // log10(1) = 0
const MAX_LOG = 4; // log10(10000) = 4, covers up to 10,000
const MIN_BAR_HEIGHT_RATIO = 0.03; // Minimum 3% height for bars with at least 1 item

/** Convert a value to logarithmic position (0-1 range) */
function toLogScale(value: number): number {
  if (value <= 0) return 0;
  const logValue = Math.log10(value);
  const scaled = Math.max(
    0,
    Math.min(1, (logValue - MIN_LOG) / (MAX_LOG - MIN_LOG))
  );
  // Ensure bars with at least 1 item have a minimum visible height
  return Math.max(MIN_BAR_HEIGHT_RATIO, scaled);
}

// A palette of distinct, vibrant colors for different dates
const DATE_COLORS = [
  "#e63946", // vivid red
  "#f77f00", // orange
  "#fcbf49", // golden yellow
  "#84a98c", // sage green
  "#2a9d8f", // teal
  "#0077b6", // deep blue
  "#7209b7", // purple
  "#f72585", // hot pink
  "#4361ee", // royal blue
  "#3a0ca3", // indigo
  "#06d6a0", // mint
  "#118ab2", // cerulean
  "#ef476f", // coral pink
  "#ffd166", // sunny yellow
  "#073b4c", // dark teal
  "#8338ec", // violet
  "#ff6b6b", // salmon
  "#4ecdc4", // turquoise
  "#ffe66d", // lemon
  "#95e1d3", // seafoam
];

export function AccuracyChart({
  data,
  title,
  excludeTopWinners = 1,
}: AccuracyChartProps) {
  if (data.length === 0) return null;

  // Optionally find and remove the top N dates by total winnings to avoid data skew
  let chartData = data;
  if (excludeTopWinners > 0 && data.length > excludeTopWinners) {
    const dateWinnings = data.map((result) => {
      const totalWinnings = result.accuracy.reduce(
        (sum, count, correctCount) => {
          const pengeValue = result.penge[String(correctCount)] ?? 0;
          return sum + count * pengeValue;
        },
        0
      );
      return { date: result.date, winnings: totalWinnings };
    });

    // Sort by winnings descending and get the top N dates to exclude
    const sortedByWinnings = [...dateWinnings].sort(
      (a, b) => b.winnings - a.winnings
    );
    const datesToExclude = new Set(
      sortedByWinnings.slice(0, excludeTopWinners).map((d) => d.date)
    );

    chartData = data.filter((result) => !datesToExclude.has(result.date));
  }

  const matchCount = chartData[0].accuracy.length - 1; // e.g., 13 for 13 matches

  // Calculate stacked data for each "correct count" bucket (0 to matchCount)
  const stackedData: {
    correctCount: number;
    segments: { date: string; count: number; color: string; money: number }[];
    total: number;
    money: number;
  }[] = [];

  let totalBets = 0;
  let totalWinnings = 0;

  for (let correctCount = 0; correctCount <= matchCount; correctCount++) {
    const segments: {
      date: string;
      count: number;
      color: string;
      money: number;
    }[] = [];
    let total = 0;
    let money = 0;

    chartData.forEach((result, dateIndex) => {
      const count = result.accuracy[correctCount];
      if (count > 0) {
        // Calculate money earned: count * penge value for this correctCount
        const pengeValue = result.penge[String(correctCount)] ?? 0;
        const segmentMoney = count * pengeValue;
        segments.push({
          date: result.date,
          count,
          color: DATE_COLORS[dateIndex % DATE_COLORS.length],
          money: segmentMoney,
        });
        total += count;
        money += segmentMoney;
      }
    });

    totalBets += total;
    totalWinnings += money;
    stackedData.push({ correctCount, segments, total, money });
  }

  // Calculate profit/loss: winnings minus cost (each bet costs 1 kr)
  const profitLoss = totalWinnings - totalBets;
  const profitLossLabel =
    profitLoss >= 0
      ? `+${profitLoss.toLocaleString()} kr`
      : `${profitLoss.toLocaleString()} kr`;

  // Count winning bets (10+ correct)
  const winningBets = stackedData
    .filter((d) => d.correctCount >= WINNING_THRESHOLD)
    .reduce((sum, d) => sum + d.total, 0);

  // Chart dimensions (viewBox coordinates, SVG scales to fill container)
  const chartWidth = 1000;
  const chartHeight = 500;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 50;
  const barAreaWidth = chartWidth - paddingLeft - paddingRight;
  const barAreaHeight = chartHeight - paddingTop - paddingBottom;
  const barWidth = barAreaWidth / (matchCount + 1) - 4;
  const barGap = 4;

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        {title}{" "}
        <span
          className={
            profitLoss >= 0 ? styles.profitPositive : styles.profitNegative
          }
        >
          ({profitLossLabel})
        </span>
      </h3>
      <p className={styles.subtitle}>
        Correct predictions per bet — winning zone: {WINNING_THRESHOLD}+ correct
        ({winningBets.toLocaleString()} of {totalBets.toLocaleString()} bets)
      </p>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
        className={styles.chart}
      >
        {/* Winning zone background */}
        <rect
          x={paddingLeft + WINNING_THRESHOLD * (barWidth + barGap)}
          y={paddingTop}
          width={
            (matchCount + 1 - WINNING_THRESHOLD) * (barWidth + barGap) - barGap
          }
          height={barAreaHeight}
          className={styles.winningZone}
        />

        {/* Y-axis gridlines (logarithmic: 1, 10, 100, 1000, 10000) */}
        {[1, 10, 100, 1000, 10000].map((value) => {
          const logPos = toLogScale(value);
          const y = paddingTop + barAreaHeight * (1 - logPos);
          return (
            <g key={value}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                className={styles.gridLine}
              />
              <text x={paddingLeft - 8} y={y + 4} className={styles.axisLabel}>
                {value.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Stacked bars with logarithmic total height */}
        {stackedData.map(({ correctCount, segments, total, money }) => {
          const x = paddingLeft + correctCount * (barWidth + barGap);
          const totalLogHeight = toLogScale(total) * barAreaHeight;
          const barTopY = paddingTop + barAreaHeight - totalLogHeight;

          // Stack segments proportionally within the log-scaled bar height
          let yOffset = 0;

          return (
            <g key={correctCount}>
              {segments.map((segment, i) => {
                // Each segment's height is proportional to its share of total
                const segmentHeight = (segment.count / total) * totalLogHeight;
                const y = paddingTop + barAreaHeight - yOffset - segmentHeight;
                yOffset += segmentHeight;

                return (
                  <rect
                    key={`${segment.date}-${i}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={segmentHeight}
                    fill={segment.color}
                    className={styles.bar}
                  >
                    <title>
                      {segment.date}: {segment.count} bets with {correctCount}{" "}
                      correct — Won {segment.money.toLocaleString()} kr
                    </title>
                  </rect>
                );
              })}
              {/* Total count and money label on top of bar */}
              {total > 0 && (
                <>
                  <text
                    x={x + barWidth / 2}
                    y={barTopY - (money > 0 ? 18 : 5)}
                    className={styles.barLabel}
                  >
                    {total}
                  </text>
                  {money > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={barTopY - 5}
                      className={styles.moneyLabel}
                    >
                      ${money.toLocaleString()}
                    </text>
                  )}
                </>
              )}
              {/* X-axis label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight - paddingBottom + 20}
                className={`${styles.axisLabel} ${
                  correctCount >= WINNING_THRESHOLD ? styles.winningLabel : ""
                }`}
              >
                {correctCount}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={chartWidth / 2}
          y={chartHeight - 5}
          className={styles.axisTitle}
        >
          Correct Predictions
        </text>
        <text
          x={15}
          y={chartHeight / 2}
          transform={`rotate(-90, 15, ${chartHeight / 2})`}
          className={styles.axisTitle}
        >
          Number of Bets (log scale)
        </text>
      </svg>
    </div>
  );
}

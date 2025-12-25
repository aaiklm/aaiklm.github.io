import type { AccuracyResult } from "../../utils/calculateBetsAccuracy";
import styles from "./index.module.css";

/** The minimum number of correct predictions needed to win */
const WINNING_THRESHOLD = 10;

type AccuracyChartProps = {
  data: AccuracyResult[];
  title: string;
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

export function AccuracyChart({ data, title }: AccuracyChartProps) {
  if (data.length === 0) return null;

  const matchCount = data[0].accuracy.length - 1; // e.g., 13 for 13 matches

  // Calculate stacked data for each "correct count" bucket (0 to matchCount)
  const stackedData: {
    correctCount: number;
    segments: { date: string; count: number; color: string }[];
    total: number;
  }[] = [];

  for (let correctCount = 0; correctCount <= matchCount; correctCount++) {
    const segments: { date: string; count: number; color: string }[] = [];
    let total = 0;

    data.forEach((result, dateIndex) => {
      const count = result.accuracy[correctCount];
      if (count > 0) {
        segments.push({
          date: result.date,
          count,
          color: DATE_COLORS[dateIndex % DATE_COLORS.length],
        });
        total += count;
      }
    });

    stackedData.push({ correctCount, segments, total });
  }

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
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.subtitle}>
        Correct predictions per bet — winning zone: {WINNING_THRESHOLD}+ correct
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
        {stackedData.map(({ correctCount, segments, total }) => {
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
                      correct
                    </title>
                  </rect>
                );
              })}
              {/* Total count label on top of bar */}
              {total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={barTopY - 5}
                  className={styles.barLabel}
                >
                  {total}
                </text>
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

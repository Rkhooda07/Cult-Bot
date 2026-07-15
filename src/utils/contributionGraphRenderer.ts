import { createCanvas } from "@napi-rs/canvas";
import { ContributionCalendarData } from "../services/githubService";

const CELL_SIZE = 12;
const CELL_GAP = 2;
const WEEK_LABEL_WIDTH = 30;
const MONTH_LABEL_HEIGHT = 20;
const PADDING = 20;

const GITHUB_GREEN_LEVELS = [
  "#ebedf0", // 0 contributions
  "#9be9a8", // 1-3
  "#40c463", // 4-6
  "#30a14e", // 7-9
  "#216e39", // 10+
];

function getColorForCount(count: number): string {
  if (count === 0) return GITHUB_GREEN_LEVELS[0];
  if (count <= 3) return GITHUB_GREEN_LEVELS[1];
  if (count <= 6) return GITHUB_GREEN_LEVELS[2];
  if (count <= 9) return GITHUB_GREEN_LEVELS[3];
  return GITHUB_GREEN_LEVELS[4];
}

function getWeekDayLabel(dayIndex: number): string {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[dayIndex];
}

function getMonthLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return months[date.getUTCMonth()];
}

/**
 * Render a GitHub-style contribution graph as a PNG buffer.
 * Mimics the classic GitHub profile contribution calendar heatmap.
 */
export async function renderContributionGraph(
  calendar: ContributionCalendarData
): Promise<Buffer> {
  const weeks = calendar.weeks;
  if (!weeks || weeks.length === 0) {
    return renderEmptyGraph();
  }

  const numWeeks = weeks.length;
  const canvasWidth =
    PADDING * 2 + WEEK_LABEL_WIDTH + numWeeks * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const canvasHeight =
    PADDING * 2 + MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const monthLabelsDrawn = new Set<string>();
  const monthLabelPositions: Array<{ x: number; label: string }> = [];

  for (let weekIdx = 0; weekIdx < numWeeks; weekIdx++) {
    const week = weeks[weekIdx];
    if (!week?.contributionDays) continue;

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const day = week.contributionDays[dayIdx];
      if (!day) continue;

      const x =
        PADDING +
        WEEK_LABEL_WIDTH +
        weekIdx * (CELL_SIZE + CELL_GAP);
      const y =
        PADDING +
        MONTH_LABEL_HEIGHT +
        dayIdx * (CELL_SIZE + CELL_GAP);

      const color = getColorForCount(day.contributionCount);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      if (dayIdx === 0) {
        const monthLabel = getMonthLabel(day.date);
        if (!monthLabelsDrawn.has(monthLabel)) {
          monthLabelsDrawn.add(monthLabel);
          const labelX = x - WEEK_LABEL_WIDTH + CELL_SIZE / 2;
          monthLabelPositions.push({ x: labelX, label: monthLabel });
        }
      }
    }
  }

  ctx.fillStyle = "#8b949e";
  ctx.font = "10px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    if (dayIdx % 2 === 0) {
      const label = getWeekDayLabel(dayIdx);
      const y =
        PADDING +
        MONTH_LABEL_HEIGHT +
        dayIdx * (CELL_SIZE + CELL_GAP) +
        CELL_SIZE / 2;
      ctx.fillText(label, PADDING + WEEK_LABEL_WIDTH - 4, y);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const { x, label } of monthLabelPositions) {
    ctx.fillText(label, x, PADDING + MONTH_LABEL_HEIGHT - 2);
  }

  return canvas.toBuffer("image/png");
}

async function renderEmptyGraph(): Promise<Buffer> {
  const canvas = createCanvas(400, 150);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, 400, 150);
  ctx.fillStyle = "#8b949e";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("No contribution data available", 200, 75);
  return canvas.toBuffer("image/png");
}
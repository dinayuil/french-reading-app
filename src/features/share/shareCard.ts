import type { TFunction } from 'i18next';

export interface ShareCardDay {
  date: string;
  completedArticles: number;
  totalMs: number;
}

export interface ShareCardStats {
  today: ShareCardDay;
  days: ShareCardDay[];
}

export interface ShareCardBar {
  date: string;
  weekday: string;
  count: number;
  /** 0..1, relative to the busiest of the seven days. */
  ratio: number;
}

export interface ShareCardModel {
  appName: string;
  title: string;
  dateLabel: string;
  todayCount: number;
  goal: number;
  todayTime: string;
  todayLabel: string;
  completedLabel: string;
  goalLabel: string;
  studyTimeLabel: string;
  weekTitle: string;
  weekTotal: string;
  weekTotalLabel: string;
  weekEmpty: string;
  weekBars: ShareCardBar[];
  footer: string;
}

const BRAND_INK = '#101b33';
const BRAND_INK_LIGHT = '#1a2b4a';
const BRAND_PAPER = '#fbf9f4';
const BRAND_TEXT = '#1f2937';
const BRAND_MUTED = '#5f6b7a';
const BRAND_BLUE = '#2b4c8c';
const BRAND_BLUE_SOFT = '#dbe5f8';
const BRAND_GOLD = '#c9a45c';

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatShareDuration(ms: number, locale: string, t: TFunction): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const number = new Intl.NumberFormat(locale);

  if (hours > 0 && minutes > 0) {
    return t('data.duration.hoursMinutes', {
      hours: number.format(hours),
      minutes:
        locale.startsWith('zh') ? number.format(minutes) : String(minutes).padStart(2, '0'),
    });
  }
  if (hours > 0) {
    return t('data.duration.hours', { hours: number.format(hours) });
  }
  if (totalMinutes > 0) {
    return t('data.duration.minutes', { minutes: number.format(totalMinutes) });
  }
  return ms > 0 ? t('data.duration.underMinute') : t('data.duration.zero');
}

export function buildShareCardModel(
  stats: ShareCardStats,
  dailyGoal: number,
  language: string,
  t: TFunction,
  now: Date = new Date(),
): ShareCardModel {
  const locale = language.startsWith('zh') ? 'zh-CN' : 'fr-FR';
  const goal = Math.min(20, Math.max(1, Math.round(dailyGoal) || 1));
  const days = stats.days.slice(-7);
  const maxCount = Math.max(1, ...days.map((day) => day.completedArticles));
  const weekTotalMs = days.reduce((sum, day) => sum + day.totalMs, 0);
  const weekCompleted = days.reduce(
    (sum, day) => sum + day.completedArticles,
    0,
  );
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  return {
    appName: 'Lire en français',
    title: t('share.title'),
    dateLabel: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
    todayCount: stats.today.completedArticles,
    goal,
    todayTime: formatShareDuration(stats.today.totalMs, locale, t),
    todayLabel: t('share.today'),
    completedLabel: t('share.completed', {
      count: stats.today.completedArticles,
    }),
    goalLabel: t('share.goal', { count: goal }),
    studyTimeLabel: t('share.studyTime'),
    weekTitle: t('share.weekTitle'),
    weekTotal: formatShareDuration(weekTotalMs, locale, t),
    weekTotalLabel: t('share.weekTotal'),
    weekEmpty:
      weekTotalMs === 0 && weekCompleted === 0 ? t('share.empty') : '',
    weekBars: days.map((day) => ({
      date: day.date,
      weekday: weekdayFormat.format(localDate(day.date)),
      count: day.completedArticles,
      ratio: Math.min(1, day.completedArticles / maxCount),
    })),
    footer: t('share.footer'),
  };
}

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  family: string,
  weight = '700',
): number {
  let size = startSize;
  do {
    context.font = `${weight} ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 8;
  } while (size > 24);
  return size;
}

/**
 * Draws the actual PNG card on a canvas. All figures come from completed
 * records; nothing is illustrated or invented.
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  model: ShareCardModel,
): void {
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');

  const width = SHARE_CARD_WIDTH;
  const height = SHARE_CARD_HEIGHT;
  const serif = 'Georgia, "Times New Roman", "Songti SC", serif';
  const sans =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", "Microsoft YaHei", sans-serif';

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, BRAND_INK);
  background.addColorStop(0.62, BRAND_INK_LIGHT);
  background.addColorStop(1, '#223a61');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.16;
  context.fillStyle = BRAND_GOLD;
  context.beginPath();
  context.arc(width - 40, 120, 280, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.1;
  context.fillStyle = BRAND_BLUE_SOFT;
  context.beginPath();
  context.arc(60, height - 120, 220, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Wordmark and date
  context.fillStyle = BRAND_PAPER;
  context.font = `700 46px ${serif}`;
  context.fillText(model.appName, 72, 116);
  context.fillStyle = 'rgba(251, 249, 244, 0.72)';
  context.font = `400 26px ${sans}`;
  context.textAlign = 'right';
  context.fillText(model.dateLabel, width - 72, 112);
  context.textAlign = 'left';

  context.fillStyle = BRAND_GOLD;
  context.font = `700 24px ${sans}`;
  context.fillText(model.title.toUpperCase(), 72, 178);

  // Today hero card
  roundedRect(context, 72, 216, width - 144, 500, 34);
  context.fillStyle = BRAND_PAPER;
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = BRAND_BLUE;
  context.font = `700 24px ${sans}`;
  context.fillText(model.todayLabel.toUpperCase(), 120, 286);

  const countText = String(model.todayCount);
  const countSize = fitFont(context, countText, 360, 200, serif);
  context.fillStyle = BRAND_TEXT;
  context.font = `700 ${countSize}px ${serif}`;
  context.fillText(countText, 112, 480);

  const countWidth = context.measureText(countText).width;
  context.fillStyle = BRAND_MUTED;
  context.font = `400 76px ${serif}`;
  context.fillText(`/ ${model.goal}`, 128 + countWidth, 470);

  context.fillStyle = BRAND_MUTED;
  context.font = `400 30px ${sans}`;
  context.fillText(model.completedLabel, 120, 526);

  // Goal bar
  const barX = 120;
  const barY = 566;
  const barWidth = width - 480;
  const goalRatio = Math.min(1, model.todayCount / model.goal);
  roundedRect(context, barX, barY, barWidth, 18, 9);
  context.fillStyle = BRAND_BLUE_SOFT;
  context.fill();
  if (goalRatio > 0) {
    roundedRect(context, barX, barY, Math.max(18, barWidth * goalRatio), 18, 9);
    context.fillStyle = BRAND_BLUE;
    context.fill();
  }
  context.fillStyle = BRAND_MUTED;
  context.font = `400 24px ${sans}`;
  context.fillText(model.goalLabel, barX, barY + 56);

  // Study time, aligned right
  context.textAlign = 'right';
  context.fillStyle = BRAND_MUTED;
  context.font = `700 22px ${sans}`;
  context.fillText(model.studyTimeLabel.toUpperCase(), width - 120, 566);
  context.fillStyle = BRAND_TEXT;
  context.font = `700 46px ${serif}`;
  context.fillText(model.todayTime, width - 120, 620);
  context.textAlign = 'left';

  // Week card
  const weekY = 760;
  roundedRect(context, 72, weekY, width - 144, 432, 30);
  context.fillStyle = 'rgba(255, 255, 255, 0.07)';
  context.fill();
  context.strokeStyle = 'rgba(251, 249, 244, 0.18)';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = BRAND_PAPER;
  context.font = `700 32px ${serif}`;
  context.fillText(model.weekTitle, 120, weekY + 68);

  context.textAlign = 'right';
  context.fillStyle = 'rgba(251, 249, 244, 0.66)';
  context.font = `400 22px ${sans}`;
  context.fillText(model.weekTotalLabel.toUpperCase(), width - 120, weekY + 56);
  context.fillStyle = BRAND_PAPER;
  context.font = `700 32px ${serif}`;
  context.fillText(model.weekTotal, width - 120, weekY + 98);
  context.textAlign = 'left';

  const columns = Math.max(1, model.weekBars.length);
  const chartX = 120;
  const chartWidth = width - 240;
  const columnWidth = chartWidth / columns;
  const baseline = weekY + 330;
  const maxBarHeight = 150;

  if (model.weekEmpty) {
    context.fillStyle = 'rgba(251, 249, 244, 0.62)';
    context.font = `400 30px ${sans}`;
    context.textAlign = 'center';
    context.fillText(model.weekEmpty, width / 2, weekY + 246);
    context.textAlign = 'left';
  }

  model.weekBars.forEach((bar, index) => {
    const centerX = chartX + columnWidth * index + columnWidth / 2;
    const barHeight = Math.max(10, Math.round(maxBarHeight * bar.ratio));
    const barW = Math.min(54, columnWidth * 0.48);

    context.fillStyle =
      bar.count > 0 ? BRAND_GOLD : 'rgba(251, 249, 244, 0.2)';
    roundedRect(
      context,
      centerX - barW / 2,
      baseline - barHeight,
      barW,
      barHeight,
      10,
    );
    context.fill();

    if (bar.count > 0) {
      context.fillStyle = BRAND_PAPER;
      context.font = `700 26px ${sans}`;
      context.textAlign = 'center';
      context.fillText(String(bar.count), centerX, baseline - barHeight - 16);
    }

    context.fillStyle = 'rgba(251, 249, 244, 0.72)';
    context.font = `400 22px ${sans}`;
    context.textAlign = 'center';
    context.fillText(bar.weekday, centerX, baseline + 38);
    context.textAlign = 'left';
  });

  // Footer
  context.fillStyle = 'rgba(251, 249, 244, 0.66)';
  context.font = `400 24px ${sans}`;
  context.fillText(model.footer, 72, height - 54);
  context.textAlign = 'right';
  context.fillStyle = BRAND_GOLD;
  context.fillText(model.appName, width - 72, height - 54);
  context.textAlign = 'left';
}

export function renderShareCardPng(model: ShareCardModel): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, model);
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed.'));
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getStudySummary,
  readStudyData,
} from '../features/data/backup';
import {
  getLearningStatistics,
  localDateKey,
} from '../features/stats/statistics';
import {
  buildShareCardModel,
  renderShareCardPng,
} from '../features/share/shareCard';
import { exportPngFile } from '../platform/files';
import { isNativeApp } from '../platform/runtime';
import {
  MIN_DAILY_GOAL,
  isValidDailyGoal,
  loadSettings,
} from '../lib/settings';
import { useStudyDataVersion } from '../lib/studyDataEvents';
import NoticeMessage, { type Notice } from '../components/NoticeMessage';
import '../styles/data.css';

function shareFilename(date = new Date()): string {
  return `lire-en-francais-progres-${localDateKey(date)}.png`;
}

function isExportCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'exportCancelled'
  );
}

function parseLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export default function StatsPage() {
  const { t, i18n } = useTranslation();
  const version = useStudyDataVersion();
  const [native] = useState(() => isNativeApp());
  const [settings, setSettings] = useState(() => loadSettings());
  const [range, setRange] = useState<7 | 30>(7);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // The goal can change in Settings or in another tab.
    setSettings(loadSettings());
  }, [version]);

  const zh = i18n.language.startsWith('zh');
  const locale = zh ? 'zh-CN' : 'fr-FR';
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const data = useMemo(() => readStudyData(), [version]);
  const summary = useMemo(() => getStudySummary(data), [data]);
  const stats = useMemo(
    () => getLearningStatistics(data, new Date(), range),
    [data, range],
  );
  const dailyGoal = isValidDailyGoal(settings.dailyGoal)
    ? settings.dailyGoal
    : MIN_DAILY_GOAL;
  const todayCount = stats.today.completedArticles;
  const goalReached = todayCount >= dailyGoal;
  const goalRatio = Math.min(1, todayCount / dailyGoal);

  const formatStudyTime = (ms: number): string => {
    const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return t('data.duration.hoursMinutes', {
        hours: numberFormat.format(hours),
        minutes: zh
          ? numberFormat.format(minutes)
          : String(minutes).padStart(2, '0'),
      });
    }
    if (hours > 0) {
      return t('data.duration.hours', {
        hours: numberFormat.format(hours),
      });
    }
    if (totalMinutes > 0) {
      return t('data.duration.minutes', {
        minutes: numberFormat.format(totalMinutes),
      });
    }
    return ms > 0
      ? t('data.duration.underMinute')
      : t('data.duration.zero');
  };

  const accuracy =
    summary.totalAnswers > 0
      ? new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(summary.correctAnswers / summary.totalAnswers)
      : '—';

  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale],
  );
  const chartDateLabel = (date: string): string =>
    weekdayFormat.format(parseLocalDay(date));
  const chartAriaDate = (date: string): string =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(parseLocalDay(date));
  const maxDayCount = Math.max(
    1,
    ...stats.days.map((day) => day.completedArticles),
  );

  const hasActivity =
    summary.readingMs > 0 ||
    summary.readingArticles > 0 ||
    summary.practiceAttempts > 0 ||
    summary.totalAnswers > 0;

  const handleShare = async () => {
    setSharing(true);
    setShareNotice(null);

    try {
      const shareStats = getLearningStatistics(data, new Date(), 7);
      const model = buildShareCardModel(
        shareStats,
        dailyGoal,
        i18n.language,
        t,
      );
      const blob = await renderShareCardPng(model);
      await exportPngFile(shareFilename(), blob);
      setShareNotice({
        tone: 'success',
        key: native ? 'stats.share.successShare' : 'stats.share.successSave',
      });
    } catch (error) {
      if (isExportCancelled(error)) {
        setShareNotice({ tone: 'info', key: 'stats.share.cancelled' });
      } else {
        setShareNotice({ tone: 'error', key: 'stats.share.error' });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="container page data-page stats-page">
      <header className="data-page__header">
        <div>
          <h1 className="page__title data-page__title">{t('stats.title')}</h1>
          <p className="data-page__lede">{t('stats.lede')}</p>
        </div>
      </header>

      <section className="data-hero" aria-labelledby="stats-hero-title">
        <div className="data-hero__main">
          <h2 className="data-hero__eyebrow" id="stats-hero-title">
            {t('stats.hero.today')}
          </h2>
          <p className="data-hero__figure">
            <strong>{numberFormat.format(todayCount)}</strong>
            <span aria-hidden="true">/{numberFormat.format(dailyGoal)}</span>
            <span className="sr-only">
              {t('stats.hero.goalProgress', {
                done: todayCount,
                goal: dailyGoal,
              })}
            </span>
          </p>
          <p className="data-hero__completed">
            {t('stats.hero.completed', { count: todayCount })}
          </p>
          <div
            className="data-hero__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={dailyGoal}
            aria-valuenow={Math.min(todayCount, dailyGoal)}
            aria-valuetext={
              goalReached
                ? t('stats.hero.goalReached')
                : t('stats.hero.goalProgress', {
                    done: todayCount,
                    goal: dailyGoal,
                  })
            }
          >
            <span
              className="data-hero__progress-value"
              style={{ '--goal-ratio': `${Math.round(goalRatio * 100)}%` } as CSSProperties}
            />
          </div>
          <p className={`data-hero__goal-state${goalReached ? ' data-hero__goal-state--reached' : ''}`}>
            {goalReached
              ? t('stats.hero.goalReached')
              : t('stats.hero.goalProgress', {
                  done: todayCount,
                  goal: dailyGoal,
                })}
          </p>
        </div>

        <div className="data-hero__side">
          <p className="data-hero__side-label">{t('stats.hero.studyTime')}</p>
          <p className="data-hero__time">
            {formatStudyTime(stats.today.totalMs)}
          </p>
          <p className="data-hero__goal-link">
            <Link to="/settings">{t('stats.hero.goalSettingsLink')}</Link>
          </p>
        </div>
      </section>

      <section className="data-chart" aria-labelledby="stats-chart-title">
        <div className="data-chart__header">
          <div>
            <h2 id="stats-chart-title" className="data-chart__title">
              {t('stats.chart.title')}
            </h2>
            <p className="data-chart__totals">
              <span>
                {t('stats.chart.articles')}{' '}
                <strong>{numberFormat.format(stats.completedArticles)}</strong>
              </span>
              <span>
                {t('stats.chart.time')}{' '}
                <strong>{formatStudyTime(stats.totalMs)}</strong>
              </span>
            </p>
          </div>
          <div
            className="segmented data-chart__ranges"
            role="group"
            aria-label={t('stats.chart.rangeLabel')}
          >
            {([7, 30] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="segmented__button"
                aria-pressed={range === option}
                onClick={() => setRange(option)}
              >
                {option === 7
                  ? t('stats.chart.range7')
                  : t('stats.chart.range30')}
              </button>
            ))}
          </div>
        </div>

        {stats.completedArticles === 0 && stats.totalMs === 0 ? (
          <p className="data-chart__empty data-chart__empty--panel">
            {t('stats.chart.empty')}
          </p>
        ) : (
          <div className="data-chart__scroller">
            <ol
              className={`data-chart__bars data-chart__bars--${range}`}
              aria-label={t('stats.chart.title')}
            >
              {stats.days.map((day) => {
                const ratio = day.completedArticles / maxDayCount;
                return (
                  <li
                    key={day.date}
                    className={`data-chart__day${
                      day.completedArticles > 0
                        ? ' data-chart__day--active'
                        : ''
                    }`}
                    aria-label={t('stats.chart.dayAria', {
                      date: chartAriaDate(day.date),
                      count: day.completedArticles,
                      time: formatStudyTime(day.totalMs),
                    })}
                  >
                    <span
                      className="data-chart__bar-track"
                      aria-hidden="true"
                    >
                      <span
                        className="data-chart__bar"
                        style={
                          {
                            '--bar-ratio': `${Math.round(ratio * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span
                      className={`data-chart__count${
                        day.completedArticles === 0
                          ? ' data-chart__count--empty'
                          : ''
                      }`}
                      aria-hidden="true"
                    >
                      {day.completedArticles === 0
                        ? '\u00A0'
                        : day.completedArticles}
                    </span>
                    <span
                      className="data-chart__weekday"
                      aria-hidden="true"
                    >
                      {range === 7
                        ? chartDateLabel(day.date)
                        : parseLocalDay(day.date).getDate()}
                    </span>
                    {range === 7 && (
                      <span
                        className="data-chart__time"
                        aria-hidden="true"
                      >
                        {formatStudyTime(day.totalMs)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      <section
        className="data-summary"
        aria-labelledby="stats-summary-title"
      >
        <h2 id="stats-summary-title" className="data-summary__title">
          {t('stats.summary.title')}
        </h2>

        <dl className="data-summary__grid">
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.readingTime')}
            </dt>
            <dd className="data-summary__value">
              {formatStudyTime(summary.readingMs)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.studyTime')}
            </dt>
            <dd className="data-summary__value">
              {formatStudyTime(summary.readingMs + summary.practiceMs)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.readingArticles')}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(summary.readingArticles)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.practiceAttempts')}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(summary.practiceAttempts)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.accuracy')}
            </dt>
            <dd className="data-summary__value">{accuracy}</dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('stats.summary.activeDays', {
                range:
                  range === 7
                    ? t('stats.chart.range7')
                    : t('stats.chart.range30'),
              })}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(stats.activeDays)}
            </dd>
          </div>
        </dl>

        {!hasActivity && (
          <p className="data-summary__empty">{t('stats.summary.empty')}</p>
        )}
      </section>

      <div className="data-tools stats-page__tools">
        <section className="data-card" aria-labelledby="stats-share-title">
          <h2 id="stats-share-title" className="data-card__title">
            {t('stats.share.title')}
          </h2>
          <p className="data-card__body">{t('stats.share.body')}</p>
          <div className="data-card__footer">
            <button
              type="button"
              className="data-button data-button--primary"
              onClick={handleShare}
              disabled={sharing}
              aria-busy={sharing || undefined}
            >
              {sharing
                ? t('stats.share.busy')
                : native
                  ? t('stats.share.share')
                  : t('stats.share.save')}
            </button>
            <NoticeMessage notice={shareNotice} />
            <p className="data-card__hint">{t('stats.share.hint')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

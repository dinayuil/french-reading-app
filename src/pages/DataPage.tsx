import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_BACKUP_BYTES,
  applyBackup,
  createBackup,
  getStudySummary,
  hasPreviousBackup,
  parseBackup,
  readStudyData,
  restorePreviousBackup,
  type StudyBackup,
} from '../features/data/backup';
import { getLearningStatistics, localDateKey } from '../features/stats/statistics';
import {
  buildShareCardModel,
  renderShareCardPng,
} from '../features/share/shareCard';
import {
  loadWebDavSettings,
  saveWebDavSettings,
  syncWebDav,
  type WebDavConfig,
} from '../features/sync/webdav';
import { exportDataFile, exportPngFile } from '../platform/files';
import { isNativeApp } from '../platform/runtime';
import {
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  isValidDailyGoal,
  loadSettings,
  saveSettings,
} from '../lib/settings';
import { applyTheme } from '../lib/theme';
import {
  notifyStudyDataChanged,
  useStudyDataVersion,
} from '../lib/studyDataEvents';
import ThemeControl from '../components/ThemeControl';
import type { Settings } from '../types/progress';
import '../styles/data.css';

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  key: string;
  values?: Record<string, string>;
}

const SYNC_ERROR_CODES = [
  'nativeOnly',
  'invalidUrl',
  'auth',
  'network',
  'invalidRemote',
  'unsupportedServer',
  'conflict',
  'remoteMissingDirectory',
  'storage',
] as const;

type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

function getSyncErrorCode(error: unknown): SyncErrorCode | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return null;
  return SYNC_ERROR_CODES.includes(code as SyncErrorCode)
    ? (code as SyncErrorCode)
    : null;
}

function isExportCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'exportCancelled'
  );
}

function backupFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `lire-en-francais-study-backup-${year}-${month}-${day}.json`;
}

function shareFilename(date = new Date()): string {
  return `lire-en-francais-progres-${localDateKey(date)}.png`;
}

function parseLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function NoticeMessage({ notice }: { notice: Notice | null }) {
  const { t } = useTranslation();

  if (!notice) return null;

  const text = notice.values
    ? t(notice.key, notice.values)
    : t(notice.key);

  return (
    <p
      className={`data-notice data-notice--${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  );
}

export default function DataPage() {
  const { t, i18n } = useTranslation();
  const version = useStudyDataVersion();
  const [native] = useState(() => isNativeApp());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [range, setRange] = useState<7 | 30>(7);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<Notice | null>(null);
  const [preview, setPreview] = useState<StudyBackup | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [canRestore, setCanRestore] = useState(() => hasPreviousBackup());
  const [importNotice, setImportNotice] = useState<Notice | null>(null);
  const [importing, setImporting] = useState(false);
  const importRequestRef = useRef(0);
  const [webdavSettings] = useState(() =>
    native ? loadWebDavSettings() : { url: '', username: '' },
  );
  const [webdavUrl, setWebdavUrl] = useState(webdavSettings.url);
  const [webdavUsername, setWebdavUsername] = useState(
    webdavSettings.username,
  );
  const [webdavPassword, setWebdavPassword] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<Notice | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // Another tab may have imported settings or changed the goal/theme.
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
    return ms > 0 ? t('data.duration.underMinute') : t('data.duration.zero');
  };

  const accuracy =
    summary.totalAnswers > 0
      ? new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(summary.correctAnswers / summary.totalAnswers)
      : '—';

  const formatDate = (iso: string, withTime = false): string => {
    const options: Intl.DateTimeFormatOptions = withTime
      ? { hour: '2-digit', minute: '2-digit' }
      : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  };

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

  const refreshImportedSettings = (next: Settings) => {
    setSettings(next);
    applyTheme(next.theme);
  };

  const followImportedLanguage = (language: string) => {
    if (language !== i18n.language) {
      void i18n.changeLanguage(language);
    }
  };

  const changeDailyGoal = (next: number) => {
    if (!isValidDailyGoal(next)) return;
    setSettings(saveSettings({ dailyGoal: next }));
  };

  const handleExport = async () => {
    setExporting(true);
    setExportNotice(null);

    try {
      const backup = createBackup();
      await exportDataFile(
        backupFilename(),
        JSON.stringify(backup, null, 2),
      );
      setExportNotice({ tone: 'success', key: 'data.export.success' });
    } catch (error) {
      if (isExportCancelled(error)) return;
      setExportNotice({ tone: 'error', key: 'data.export.error' });
    } finally {
      setExporting(false);
    }
  };

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
        key: native ? 'data.share.successShare' : 'data.share.successSave',
      });
    } catch (error) {
      if (isExportCancelled(error)) {
        setShareNotice({ tone: 'info', key: 'data.share.cancelled' });
      } else {
        setShareNotice({ tone: 'error', key: 'data.share.error' });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const requestId = ++importRequestRef.current;
    setPreview(null);
    setConfirmingReplace(false);
    setImportNotice(null);

    if (file.size > MAX_BACKUP_BYTES) {
      setImporting(false);
      setImportNotice({ tone: 'error', key: 'data.import.tooLarge' });
      return;
    }

    setImporting(true);

    try {
      const text = await file.text();
      if (importRequestRef.current !== requestId) return;

      const parsed = parseBackup(text);
      if (importRequestRef.current !== requestId) return;

      setPreview(parsed);
    } catch {
      if (importRequestRef.current !== requestId) return;
      setImportNotice({ tone: 'error', key: 'data.import.invalid' });
    } finally {
      if (importRequestRef.current === requestId) {
        setImporting(false);
      }
    }
  };

  const handleMerge = () => {
    if (!preview) return;
    setImportNotice(null);

    try {
      applyBackup(preview, 'merge');
    } catch {
      setImportNotice({ tone: 'error', key: 'data.import.applyError' });
      return;
    }

    notifyStudyDataChanged();
    setPreview(null);
    setConfirmingReplace(false);
    setImportNotice({ tone: 'success', key: 'data.import.mergeSuccess' });
  };

  const handleReplace = () => {
    if (!preview) return;

    try {
      applyBackup(preview, 'replace');
    } catch {
      setImportNotice({ tone: 'error', key: 'data.import.applyError' });
      return;
    }

    const next = readStudyData();
    refreshImportedSettings(next.settings);
    notifyStudyDataChanged();
    setPreview(null);
    setConfirmingReplace(false);
    setCanRestore(true);
    setImportNotice({ tone: 'success', key: 'data.import.replaceSuccess' });
    followImportedLanguage(next.settings.uiLanguage);
  };

  const handleRestore = () => {
    try {
      restorePreviousBackup();
    } catch {
      setImportNotice({ tone: 'error', key: 'data.import.restoreError' });
      return;
    }

    const next = readStudyData();
    refreshImportedSettings(next.settings);
    notifyStudyDataChanged();
    setCanRestore(false);
    setImportNotice({ tone: 'success', key: 'data.import.restoreSuccess' });
    followImportedLanguage(next.settings.uiLanguage);
  };

  const handleSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!native || syncing) return;

    const config: WebDavConfig = {
      url: webdavUrl.trim(),
      username: webdavUsername.trim(),
      password: webdavPassword,
    };

    setSyncNotice(null);
    setSyncing(true);

    try {
      saveWebDavSettings({ url: config.url, username: config.username });
    } catch {
      // Remembering the address is optional; the sync can still proceed.
    }

    try {
      const result = await syncWebDav(config);
      notifyStudyDataChanged();
      setSyncNotice({
        tone: 'success',
        key: 'data.sync.success',
        values: { time: formatDate(result.syncedAt, true) },
      });
    } catch (error) {
      const code = getSyncErrorCode(error);
      setSyncNotice({
        tone: 'error',
        key: `data.sync.errors.${code ?? 'generic'}`,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container page data-page">
      <header className="data-page__header">
        <div>
          <h1 className="page__title data-page__title">{t('data.title')}</h1>
          <p className="data-page__lede">{t('data.lede')}</p>
        </div>
      </header>

      <section className="data-hero" aria-labelledby="data-hero-title">
        <div className="data-hero__main">
          <h2 className="data-hero__eyebrow" id="data-hero-title">
            {t('data.hero.today')}
          </h2>
          <p className="data-hero__figure">
            <strong>{numberFormat.format(todayCount)}</strong>
            <span aria-hidden="true">/{numberFormat.format(dailyGoal)}</span>
            <span className="sr-only">
              {t('data.hero.goalProgress', {
                done: todayCount,
                goal: dailyGoal,
              })}
            </span>
          </p>
          <p className="data-hero__completed">
            {t('data.hero.completed', { count: todayCount })}
          </p>
          <div
            className="data-hero__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={dailyGoal}
            aria-valuenow={Math.min(todayCount, dailyGoal)}
            aria-valuetext={
              goalReached
                ? t('data.hero.goalReached')
                : t('data.hero.goalProgress', {
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
              ? t('data.hero.goalReached')
              : t('data.hero.goalProgress', {
                  done: todayCount,
                  goal: dailyGoal,
                })}
          </p>
        </div>

        <div className="data-hero__side">
          <p className="data-hero__side-label">{t('data.hero.studyTime')}</p>
          <p className="data-hero__time">
            {formatStudyTime(stats.today.totalMs)}
          </p>
          <div className="data-goal">
            <div className="data-goal__header">
              <label className="data-goal__label" htmlFor="daily-goal">
                {t('data.goal.title')}
              </label>
              <span className="data-goal__value" aria-live="polite">
                {t('data.goal.value', { goal: dailyGoal })}
              </span>
            </div>
            <div className="data-goal__controls">
              <button
                type="button"
                className="data-goal__button"
                onClick={() => changeDailyGoal(dailyGoal - 1)}
                disabled={dailyGoal <= MIN_DAILY_GOAL}
                aria-label={t('data.goal.decrease')}
              >
                −
              </button>
              <input
                id="daily-goal"
                className="data-goal__range"
                type="range"
                min={MIN_DAILY_GOAL}
                max={MAX_DAILY_GOAL}
                step={1}
                value={dailyGoal}
                aria-valuetext={t('data.goal.value', { goal: dailyGoal })}
                onChange={(event) =>
                  changeDailyGoal(Number(event.target.value))
                }
              />
              <button
                type="button"
                className="data-goal__button"
                onClick={() => changeDailyGoal(dailyGoal + 1)}
                disabled={dailyGoal >= MAX_DAILY_GOAL}
                aria-label={t('data.goal.increase')}
              >
                +
              </button>
            </div>
            <p className="data-goal__hint">{t('data.goal.hint')}</p>
          </div>
        </div>
      </section>

      <section className="data-chart" aria-labelledby="data-chart-title">
        <div className="data-chart__header">
          <div>
            <h2 id="data-chart-title" className="data-chart__title">
              {t('data.chart.title')}
            </h2>
            <p className="data-chart__totals">
              <span>
                {t('data.chart.articles')}{' '}
                <strong>{numberFormat.format(stats.completedArticles)}</strong>
              </span>
              <span>
                {t('data.chart.time')}{' '}
                <strong>{formatStudyTime(stats.totalMs)}</strong>
              </span>
            </p>
          </div>
          <div
            className="segmented data-chart__ranges"
            role="group"
            aria-label={t('data.chart.rangeLabel')}
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
                  ? t('data.chart.range7')
                  : t('data.chart.range30')}
              </button>
            ))}
          </div>
        </div>

        {stats.completedArticles === 0 && stats.totalMs === 0 ? (
          <p className="data-chart__empty data-chart__empty--panel">
            {t('data.chart.empty')}
          </p>
        ) : (
          <div className="data-chart__scroller">
            <ol
              className={`data-chart__bars data-chart__bars--${range}`}
              aria-label={t('data.chart.title')}
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
                    aria-label={t('data.chart.dayAria', {
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
        aria-labelledby="data-summary-title"
      >
        <h2 id="data-summary-title" className="data-summary__title">
          {t('data.summary.title')}
        </h2>

        <dl className="data-summary__grid">
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.readingTime')}
            </dt>
            <dd className="data-summary__value">
              {formatStudyTime(summary.readingMs)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.studyTime')}
            </dt>
            <dd className="data-summary__value">
              {formatStudyTime(summary.readingMs + summary.practiceMs)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.readingArticles')}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(summary.readingArticles)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.practiceAttempts')}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(summary.practiceAttempts)}
            </dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.accuracy')}
            </dt>
            <dd className="data-summary__value">{accuracy}</dd>
          </div>
          <div className="data-summary__item">
            <dt className="data-summary__label">
              {t('data.summary.activeDays', {
                range:
                  range === 7
                    ? t('data.chart.range7')
                    : t('data.chart.range30'),
              })}
            </dt>
            <dd className="data-summary__value">
              {numberFormat.format(stats.activeDays)}
            </dd>
          </div>
        </dl>

        {!hasActivity && (
          <p className="data-summary__empty">{t('data.summary.empty')}</p>
        )}
      </section>

      <div className="data-tools">
        <section className="data-card" aria-labelledby="data-appearance-title">
          <h2 id="data-appearance-title" className="data-card__title">
            {t('data.appearance.title')}
          </h2>
          <p className="data-card__body">{t('data.appearance.body')}</p>
          <ThemeControl key={settings.theme ?? 'system'} />
        </section>

        <section className="data-card" aria-labelledby="data-share-title">
          <h2 id="data-share-title" className="data-card__title">
            {t('data.share.title')}
          </h2>
          <p className="data-card__body">{t('data.share.body')}</p>
          <div className="data-card__footer">
            <button
              type="button"
              className="data-button data-button--primary"
              onClick={handleShare}
              disabled={sharing}
              aria-busy={sharing || undefined}
            >
              {sharing
                ? t('data.share.busy')
                : native
                  ? t('data.share.share')
                  : t('data.share.save')}
            </button>
            <NoticeMessage notice={shareNotice} />
            <p className="data-card__hint">{t('data.share.hint')}</p>
          </div>
        </section>
      </div>

      <div className="data-page__actions">
        <section className="data-card" aria-labelledby="data-export-title">
          <h2 id="data-export-title" className="data-card__title">
            {t('data.export.title')}
          </h2>
          <p className="data-card__body">{t('data.export.body')}</p>
          <div className="data-card__footer">
            <button
              type="button"
              className="data-button data-button--primary"
              onClick={handleExport}
              disabled={exporting}
              aria-busy={exporting || undefined}
            >
              {t('data.export.button')}
            </button>
            <NoticeMessage notice={exportNotice} />
          </div>
        </section>

        <section className="data-card" aria-labelledby="data-import-title">
          <h2 id="data-import-title" className="data-card__title">
            {t('data.import.title')}
          </h2>
          <p className="data-card__body">{t('data.import.body')}</p>

          <label className="data-upload data-button data-button--secondary">
            {t('data.import.choose')}
            <input
              className="data-upload__input"
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
            />
          </label>

          {importing && (
            <p className="data-import__reading" role="status">
              {t('data.import.reading')}
            </p>
          )}

          {preview && (
            <div
              className="data-preview"
              role="group"
              aria-labelledby="data-import-preview-title"
            >
              <h3
                id="data-import-preview-title"
                className="data-preview__title"
              >
                {t('data.import.previewTitle')}
              </h3>
              <p className="data-preview__date">
                {t('data.import.exportedAt', {
                  date: formatDate(preview.exportedAt),
                })}
              </p>
              <ul className="data-preview__counts">
                <li>
                  {t('data.import.reading', {
                    count: preview.data.readingSessions.length,
                  })}
                </li>
                <li>
                  {t('data.import.practice', {
                    count: preview.data.practiceSessions.length,
                  })}
                </li>
                <li>
                  {t('data.import.vocabulary', {
                    count: preview.data.vocabulary?.length ?? 0,
                  })}
                </li>
                <li>
                  {t('data.import.progress', {
                    count: preview.data.readingProgress.length,
                  })}
                </li>
              </ul>

              {confirmingReplace ? (
                <div className="data-confirm" role="alert">
                  <h4 className="data-confirm__title">
                    {t('data.import.confirmTitle')}
                  </h4>
                  <p className="data-confirm__body">
                    {t('data.import.confirmBody')}
                  </p>
                  <div className="data-confirm__actions">
                    <button
                      type="button"
                      className="data-button data-button--danger"
                      onClick={handleReplace}
                      autoFocus
                    >
                      {t('data.import.confirm')}
                    </button>
                    <button
                      type="button"
                      className="data-button data-button--quiet"
                      onClick={() => setConfirmingReplace(false)}
                    >
                      {t('data.import.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="data-card__actions">
                  <button
                    type="button"
                    className="data-button data-button--primary"
                    onClick={handleMerge}
                  >
                    {t('data.import.merge')}
                  </button>
                  <button
                    type="button"
                    className="data-button data-button--danger-outline"
                    onClick={() => setConfirmingReplace(true)}
                  >
                    {t('data.import.replace')}
                  </button>
                </div>
              )}
            </div>
          )}

          {canRestore && (
            <div className="data-restore">
              <button
                type="button"
                className="data-button data-button--quiet"
                onClick={handleRestore}
              >
                {t('data.import.restore')}
              </button>
            </div>
          )}

          <NoticeMessage notice={importNotice} />
        </section>
      </div>

      {native && (
        <section
          className="data-card data-card--sync"
          aria-labelledby="data-sync-title"
        >
          <h2 id="data-sync-title" className="data-card__title">
            {t('data.sync.title')}
          </h2>
          <p className="data-card__body">{t('data.sync.body')}</p>

          <form className="data-sync" onSubmit={handleSync}>
            <div className="data-sync__field data-sync__field--wide">
              <label className="data-sync__label" htmlFor="webdav-url">
                {t('data.sync.url')}
              </label>
              <input
                id="webdav-url"
                className="data-sync__input"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={t('data.sync.urlPlaceholder')}
                value={webdavUrl}
                onChange={(event) => setWebdavUrl(event.target.value)}
                disabled={syncing}
                required
              />
            </div>

            <div className="data-sync__field">
              <label className="data-sync__label" htmlFor="webdav-username">
                {t('data.sync.username')}
              </label>
              <input
                id="webdav-username"
                className="data-sync__input"
                type="text"
                autoComplete="username"
                value={webdavUsername}
                onChange={(event) => setWebdavUsername(event.target.value)}
                disabled={syncing}
                required
              />
            </div>

            <div className="data-sync__field">
              <label
                className="data-sync__label"
                htmlFor="webdav-password"
              >
                {t('data.sync.password')}
              </label>
              <input
                id="webdav-password"
                className="data-sync__input"
                type="password"
                autoComplete="off"
                value={webdavPassword}
                onChange={(event) => setWebdavPassword(event.target.value)}
                aria-describedby="webdav-password-hint"
                disabled={syncing}
                required
              />
              <p
                id="webdav-password-hint"
                className="data-sync__hint"
              >
                {t('data.sync.passwordHint')}
              </p>
            </div>

            <div className="data-sync__submit">
              <button
                type="submit"
                className="data-button data-button--primary"
                disabled={syncing}
                aria-busy={syncing || undefined}
              >
                {syncing ? t('data.sync.busy') : t('data.sync.button')}
              </button>
              <NoticeMessage notice={syncNotice} />
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

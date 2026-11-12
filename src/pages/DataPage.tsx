import {
  useRef,
  useState,
  type ChangeEvent,
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
import {
  loadWebDavSettings,
  saveWebDavSettings,
  syncWebDav,
  type WebDavConfig,
} from '../features/sync/webdav';
import { exportDataFile } from '../platform/files';
import { isNativeApp } from '../platform/runtime';
import '../styles/data.css';

type NoticeTone = 'success' | 'error';

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

function backupFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `lire-en-francais-study-backup-${year}-${month}-${day}.json`;
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
  const [native] = useState(() => isNativeApp());
  const [summary, setSummary] = useState(() =>
    getStudySummary(readStudyData()),
  );
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

  const zh = i18n.language.startsWith('zh');
  const locale = zh ? 'zh-CN' : 'fr-FR';
  const numberFormat = new Intl.NumberFormat(locale);

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

  const hasActivity =
    summary.readingMs > 0 ||
    summary.readingArticles > 0 ||
    summary.practiceAttempts > 0 ||
    summary.totalAnswers > 0;

  const refreshSummary = () => {
    setSummary(getStudySummary(readStudyData()));
  };

  const followImportedLanguage = (language: string) => {
    if (language !== i18n.language) {
      void i18n.changeLanguage(language);
    }
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
      if (
        typeof error === 'object' && error !== null &&
        'code' in error && error.code === 'exportCancelled'
      ) return;
      setExportNotice({ tone: 'error', key: 'data.export.error' });
    } finally {
      setExporting(false);
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

    refreshSummary();
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
    setSummary(getStudySummary(next));
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
    setSummary(getStudySummary(next));
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
      refreshSummary();
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
      <h1 className="page__title data-page__title">{t('data.title')}</h1>

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
        </dl>

        {!hasActivity && (
          <p className="data-summary__empty">{t('data.summary.empty')}</p>
        )}
      </section>

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
              <label className="data-sync__label" htmlFor="webdav-password">
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
              <p id="webdav-password-hint" className="data-sync__hint">
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

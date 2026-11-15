import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MAX_BACKUP_BYTES,
  applyBackup,
  createBackup,
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
import NoticeMessage, { type Notice } from '../components/NoticeMessage';
import ThemeControl from '../components/ThemeControl';
import type { Settings } from '../types/progress';
import '../styles/data.css';

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

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const version = useStudyDataVersion();
  const [native] = useState(() => isNativeApp());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
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

  useEffect(() => {
    // Another tab may have imported settings or changed the goal/theme.
    setSettings(loadSettings());
  }, [version]);

  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'fr-FR';
  const dailyGoal = isValidDailyGoal(settings.dailyGoal)
    ? settings.dailyGoal
    : MIN_DAILY_GOAL;

  const formatDate = (iso: string, withTime = false): string => {
    const options: Intl.DateTimeFormatOptions = withTime
      ? { hour: '2-digit', minute: '2-digit' }
      : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  };

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
    notifyStudyDataChanged();
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
      setExportNotice({ tone: 'success', key: 'settings.export.success' });
    } catch (error) {
      if (isExportCancelled(error)) return;
      setExportNotice({ tone: 'error', key: 'settings.export.error' });
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
      setImportNotice({ tone: 'error', key: 'settings.import.tooLarge' });
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
      setImportNotice({ tone: 'error', key: 'settings.import.invalid' });
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
      setImportNotice({ tone: 'error', key: 'settings.import.applyError' });
      return;
    }

    notifyStudyDataChanged();
    setPreview(null);
    setConfirmingReplace(false);
    setImportNotice({ tone: 'success', key: 'settings.import.mergeSuccess' });
  };

  const handleReplace = () => {
    if (!preview) return;

    try {
      applyBackup(preview, 'replace');
    } catch {
      setImportNotice({ tone: 'error', key: 'settings.import.applyError' });
      return;
    }

    const next = readStudyData();
    refreshImportedSettings(next.settings);
    notifyStudyDataChanged();
    setPreview(null);
    setConfirmingReplace(false);
    setCanRestore(true);
    setImportNotice({
      tone: 'success',
      key: 'settings.import.replaceSuccess',
    });
    followImportedLanguage(next.settings.uiLanguage);
  };

  const handleRestore = () => {
    try {
      restorePreviousBackup();
    } catch {
      setImportNotice({ tone: 'error', key: 'settings.import.restoreError' });
      return;
    }

    const next = readStudyData();
    refreshImportedSettings(next.settings);
    notifyStudyDataChanged();
    setCanRestore(false);
    setImportNotice({
      tone: 'success',
      key: 'settings.import.restoreSuccess',
    });
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
        key: 'settings.sync.success',
        values: { time: formatDate(result.syncedAt, true) },
      });
    } catch (error) {
      const code = getSyncErrorCode(error);
      setSyncNotice({
        tone: 'error',
        key: `settings.sync.errors.${code ?? 'generic'}`,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container page data-page settings-page">
      <header className="data-page__header">
        <div>
          <h1 className="page__title data-page__title">
            {t('settings.title')}
          </h1>
          <p className="data-page__lede">{t('settings.lede')}</p>
        </div>
      </header>

      <div className="data-tools">
        <section
          className="data-card"
          aria-labelledby="settings-goal-title"
        >
          <h2 id="settings-goal-title" className="data-card__title">
            {t('settings.goal.title')}
          </h2>
          <p className="data-card__body">{t('settings.goal.body')}</p>

          <div className="data-goal data-goal--panel">
            <div className="data-goal__header">
              <label className="data-goal__label" htmlFor="daily-goal">
                {t('settings.goal.label')}
              </label>
              <span className="data-goal__value" aria-live="polite">
                {t('settings.goal.value', { goal: dailyGoal })}
              </span>
            </div>
            <div className="data-goal__controls">
              <button
                type="button"
                className="data-goal__button"
                onClick={() => changeDailyGoal(dailyGoal - 1)}
                disabled={dailyGoal <= MIN_DAILY_GOAL}
                aria-label={t('settings.goal.decrease')}
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
                aria-valuetext={t('settings.goal.value', {
                  goal: dailyGoal,
                })}
                onChange={(event) =>
                  changeDailyGoal(Number(event.target.value))
                }
              />
              <button
                type="button"
                className="data-goal__button"
                onClick={() => changeDailyGoal(dailyGoal + 1)}
                disabled={dailyGoal >= MAX_DAILY_GOAL}
                aria-label={t('settings.goal.increase')}
              >
                +
              </button>
            </div>
            <p className="data-goal__hint">{t('settings.goal.hint')}</p>
          </div>
        </section>

        <section
          className="data-card"
          aria-labelledby="settings-appearance-title"
        >
          <h2 id="settings-appearance-title" className="data-card__title">
            {t('settings.appearance.title')}
          </h2>
          <p className="data-card__body">
            {t('settings.appearance.body')}
          </p>
          <ThemeControl key={settings.theme ?? 'system'} />
        </section>
      </div>

      <div className="data-page__actions">
        <section
          className="data-card"
          aria-labelledby="settings-export-title"
        >
          <h2 id="settings-export-title" className="data-card__title">
            {t('settings.export.title')}
          </h2>
          <p className="data-card__body">{t('settings.export.body')}</p>
          <div className="data-card__footer">
            <button
              type="button"
              className="data-button data-button--primary"
              onClick={handleExport}
              disabled={exporting}
              aria-busy={exporting || undefined}
            >
              {t('settings.export.button')}
            </button>
            <NoticeMessage notice={exportNotice} />
          </div>
        </section>

        <section
          className="data-card"
          aria-labelledby="settings-import-title"
        >
          <h2 id="settings-import-title" className="data-card__title">
            {t('settings.import.title')}
          </h2>
          <p className="data-card__body">{t('settings.import.body')}</p>

          <label className="data-upload data-button data-button--secondary">
            {t('settings.import.choose')}
            <input
              className="data-upload__input"
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
            />
          </label>

          {importing && (
            <p className="data-import__reading" role="status">
              {t('settings.import.reading')}
            </p>
          )}

          {preview && (
            <div
              className="data-preview"
              role="group"
              aria-labelledby="settings-import-preview-title"
            >
              <h3
                id="settings-import-preview-title"
                className="data-preview__title"
              >
                {t('settings.import.previewTitle')}
              </h3>
              <p className="data-preview__date">
                {t('settings.import.exportedAt', {
                  date: formatDate(preview.exportedAt),
                })}
              </p>
              <ul className="data-preview__counts">
                <li>
                  {t('settings.import.reading', {
                    count: preview.data.readingSessions.length,
                  })}
                </li>
                <li>
                  {t('settings.import.practice', {
                    count: preview.data.practiceSessions.length,
                  })}
                </li>
                <li>
                  {t('settings.import.vocabulary', {
                    count: preview.data.vocabulary?.length ?? 0,
                  })}
                </li>
                <li>
                  {t('settings.import.progress', {
                    count: preview.data.readingProgress.length,
                  })}
                </li>
              </ul>

              {confirmingReplace ? (
                <div className="data-confirm" role="alert">
                  <h4 className="data-confirm__title">
                    {t('settings.import.confirmTitle')}
                  </h4>
                  <p className="data-confirm__body">
                    {t('settings.import.confirmBody')}
                  </p>
                  <div className="data-confirm__actions">
                    <button
                      type="button"
                      className="data-button data-button--danger"
                      onClick={handleReplace}
                      autoFocus
                    >
                      {t('settings.import.confirm')}
                    </button>
                    <button
                      type="button"
                      className="data-button data-button--quiet"
                      onClick={() => setConfirmingReplace(false)}
                    >
                      {t('settings.import.cancel')}
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
                    {t('settings.import.merge')}
                  </button>
                  <button
                    type="button"
                    className="data-button data-button--danger-outline"
                    onClick={() => setConfirmingReplace(true)}
                  >
                    {t('settings.import.replace')}
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
                {t('settings.import.restore')}
              </button>
            </div>
          )}

          <NoticeMessage notice={importNotice} />
        </section>
      </div>

      {native && (
        <section
          className="data-card data-card--sync"
          aria-labelledby="settings-sync-title"
        >
          <h2 id="settings-sync-title" className="data-card__title">
            {t('settings.sync.title')}
          </h2>
          <p className="data-card__body">{t('settings.sync.body')}</p>

          <form className="data-sync" onSubmit={handleSync}>
            <div className="data-sync__field data-sync__field--wide">
              <label className="data-sync__label" htmlFor="webdav-url">
                {t('settings.sync.url')}
              </label>
              <input
                id="webdav-url"
                className="data-sync__input"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={t('settings.sync.urlPlaceholder')}
                value={webdavUrl}
                onChange={(event) => setWebdavUrl(event.target.value)}
                disabled={syncing}
                required
              />
            </div>

            <div className="data-sync__field">
              <label className="data-sync__label" htmlFor="webdav-username">
                {t('settings.sync.username')}
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
                {t('settings.sync.password')}
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
                {t('settings.sync.passwordHint')}
              </p>
            </div>

            <div className="data-sync__submit">
              <button
                type="submit"
                className="data-button data-button--primary"
                disabled={syncing}
                aria-busy={syncing || undefined}
              >
                {syncing ? t('settings.sync.busy') : t('settings.sync.button')}
              </button>
              <NoticeMessage notice={syncNotice} />
            </div>
          </form>
        </section>
      )}

      <section
        className="data-card data-card--about"
        aria-labelledby="settings-about-title"
      >
        <h2 id="settings-about-title" className="data-card__title">
          {t('settings.about.title')}
        </h2>
        <p className="data-card__body">{t('settings.about.body')}</p>
        <p className="settings-about__links">
          <Link to="/aide">{t('settings.about.helpLink')}</Link>
          <Link to="/licences">{t('settings.about.licensesLink')}</Link>
        </p>
      </section>
    </div>
  );
}

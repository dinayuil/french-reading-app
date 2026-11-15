import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import SettingsPage from './SettingsPage';
import StatsPage from './StatsPage';
import { i18n } from '../i18n';
import * as backup from '../features/data/backup';
import * as files from '../platform/files';
import * as runtime from '../platform/runtime';
import * as webdav from '../features/sync/webdav';
import type { StudyBackup, StudyData } from '../features/data/backup';
import type { VocabularyEntry } from '../types/progress';

vi.mock('../features/data/backup', () => ({
  MAX_BACKUP_BYTES: 10 * 1024 * 1024,
  readStudyData: vi.fn(),
  createBackup: vi.fn(),
  parseBackup: vi.fn(),
  applyBackup: vi.fn(),
  restorePreviousBackup: vi.fn(),
  hasPreviousBackup: vi.fn(),
  getStudySummary: vi.fn(),
}));

vi.mock('../platform/files', () => ({
  exportDataFile: vi.fn(),
  exportPngFile: vi.fn(),
}));

vi.mock('../platform/runtime', () => ({
  isNativeApp: vi.fn(),
}));

vi.mock('../features/sync/webdav', () => ({
  syncWebDav: vi.fn(),
  loadWebDavSettings: vi.fn(),
  saveWebDavSettings: vi.fn(),
}));

vi.mock('../features/share/shareCard', () => ({
  buildShareCardModel: vi.fn(() => ({ title: 'Mes progrès' })),
  renderShareCardPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

const SETTINGS: StudyData['settings'] = {
  uiLanguage: 'fr',
  onboardingSeen: true,
  practiceTimerVisible: true,
};

const STUDY_DATA: StudyData = {
  readingSessions: [
    {
      id: 'reading-1',
      articleId: 'article-1',
      startedAt: '2026-11-10T09:00:00.000Z',
      durationMs: 1_800_000,
    },
    {
      id: 'reading-2',
      articleId: 'article-2',
      startedAt: '2026-11-11T09:00:00.000Z',
      durationMs: 3_600_000,
    },
  ],
  practiceSessions: [
    {
      id: 'practice-1',
      articleId: 'article-1',
      startedAt: '2026-11-10T10:00:00.000Z',
      durationMs: 600_000,
      score: 3,
      total: 4,
      answers: [],
      markedWords: [],
    },
  ],
  readingProgress: [
    {
      articleId: 'article-1',
      position: 0.4,
      completed: false,
      updatedAt: '2026-11-10T09:30:00.000Z',
    },
  ],
  settings: SETTINGS,
};

const BACKUP: StudyBackup = {
  format: 'frp-study-backup',
  version: 1,
  exportedAt: '2026-11-12T10:00:00.000Z',
  data: STUDY_DATA,
};

const SUMMARY = {
  readingMs: 5_400_000,
  practiceMs: 600_000,
  readingArticles: 3,
  practiceAttempts: 2,
  correctAnswers: 7,
  totalAnswers: 9,
};

const VOCABULARY_ENTRY: VocabularyEntry = {
  id: 'vocab-1',
  term: 'flâner',
  translation: '漫步',
  context: 'Il aime flâner.',
  articleId: 'article-1',
  articleTitle: 'Un article',
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function renderStatsAndSettings() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <StatsPage />
      <SettingsPage />
    </MemoryRouter>,
  );
}

function SettingsNavigationHarness() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate('/')}>
        Leave settings
      </button>
      <Routes>
        <Route
          path="/"
          element={
            <button type="button" onClick={() => navigate('/settings')}>
              Open settings
            </button>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </>
  );
}

function renderPageWithNavigation() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsNavigationHarness />
    </MemoryRouter>,
  );
}

async function uploadBackup(contents = JSON.stringify(BACKUP)) {
  const file = new File([contents], 'backup.json', {
    type: 'application/json',
  });
  await userEvent.upload(
    screen.getByLabelText('Choisir un fichier de sauvegarde'),
    file,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runtime.isNativeApp).mockReturnValue(false);
  vi.mocked(backup.readStudyData).mockReturnValue(STUDY_DATA);
  vi.mocked(backup.getStudySummary).mockReturnValue(SUMMARY);
  vi.mocked(backup.createBackup).mockReturnValue(BACKUP);
  vi.mocked(backup.parseBackup).mockReturnValue(BACKUP);
  vi.mocked(backup.hasPreviousBackup).mockReturnValue(false);
  vi.mocked(files.exportDataFile).mockResolvedValue(undefined);
  vi.mocked(files.exportPngFile).mockResolvedValue(undefined);
  vi.mocked(webdav.loadWebDavSettings).mockReturnValue({
    url: '',
    username: '',
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('SettingsPage', () => {
  it('shows the settings sections, about links and no WebDAV controls on the web', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Paramètres' }),
    ).toBeInTheDocument();

    for (const heading of [
      'Objectif quotidien',
      'Apparence',
      'Exporter',
      'Importer',
      'À propos',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: heading }),
      ).toBeInTheDocument();
    }

    expect(
      screen.getByRole('link', { name: "Ouvrir l'aide" }),
    ).toHaveAttribute('href', '/aide');
    expect(
      screen.getByRole('link', { name: 'Licences et sources' }),
    ).toHaveAttribute('href', '/licences');

    expect(
      screen.queryByRole('heading', { name: 'Synchronisation WebDAV' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Adresse du dossier WebDAV'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Synchroniser' }),
    ).not.toBeInTheDocument();
    expect(webdav.loadWebDavSettings).not.toHaveBeenCalled();

    expect(
      screen.queryByRole('region', { name: 'Votre activité' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Derniers jours' }),
    ).not.toBeInTheDocument();
  });

  it('adjusts the daily goal between 1 and 20 and stores it', async () => {
    const user = userEvent.setup();
    renderPage();

    const increase = screen.getByRole('button', {
      name: "Augmenter l'objectif quotidien",
    });
    const decrease = screen.getByRole('button', {
      name: "Réduire l'objectif quotidien",
    });
    const slider = screen.getByRole('slider', {
      name: 'Articles à terminer par jour',
    });

    expect(decrease).toBeDisabled();
    await user.click(increase);
    await user.click(increase);

    expect(screen.getByText('Objectif : 3 par jour')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ dailyGoal: 3 });

    fireEvent.change(slider, { target: { value: '20' } });
    expect(screen.getByText('Objectif : 20 par jour')).toBeInTheDocument();
    expect(increase).toBeDisabled();

    fireEvent.change(slider, { target: { value: '1' } });
    expect(screen.getByText('Objectif : 1 par jour')).toBeInTheDocument();
    expect(decrease).toBeDisabled();
  });

  it('updates an open statistics view when the daily goal changes', async () => {
    const user = userEvent.setup();
    renderStatsAndSettings();

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuemax', '1');

    await user.click(
      screen.getByRole('button', { name: "Augmenter l'objectif quotidien" }),
    );

    expect(progress).toHaveAttribute('aria-valuemax', '2');
    expect(screen.getByText('Objectif : 2 par jour')).toBeInTheDocument();
  });

  it('exports the backup with a recognizable filename and reports the result', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Exporter la sauvegarde' }),
    );

    await waitFor(() =>
      expect(files.exportDataFile).toHaveBeenCalledTimes(1),
    );
    const [filename, contents] = vi.mocked(files.exportDataFile).mock
      .calls[0];
    expect(filename).toMatch(
      /^lire-en-francais-study-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(JSON.parse(contents)).toEqual(BACKUP);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sauvegarde exportée.',
    );
  });

  it('reports an export failure without claiming success', async () => {
    const user = userEvent.setup();
    vi.mocked(files.exportDataFile).mockRejectedValueOnce(
      new Error('share unavailable'),
    );
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Exporter la sauvegarde' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /L'export a échoué/,
    );
    expect(screen.queryByText('Sauvegarde exportée.')).not.toBeInTheDocument();
  });

  it('previews an imported file, then merges only after the reader confirms', async () => {
    const user = userEvent.setup();
    renderPage();

    await uploadBackup();

    expect(
      await screen.findByRole('heading', { name: 'Aperçu du fichier' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 séances de lecture')).toBeInTheDocument();
    expect(screen.getByText('1 exercice terminé')).toBeInTheDocument();
    expect(
      screen.getByText('1 article avec position enregistrée'),
    ).toBeInTheDocument();
    expect(backup.applyBackup).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Fusionner avec mes données' }),
    );

    expect(backup.applyBackup).toHaveBeenCalledWith(BACKUP, 'merge');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sauvegarde fusionnée.',
    );
    expect(
      screen.queryByRole('heading', { name: 'Aperçu du fichier' }),
    ).not.toBeInTheDocument();
  });

  it('offers the previous restore again after navigating away and back', async () => {
    vi.mocked(backup.hasPreviousBackup).mockReturnValue(true);
    renderPageWithNavigation();

    expect(
      screen.getByRole('button', { name: "Restaurer l'état précédent" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave settings' }),
    );
    expect(
      screen.queryByRole('button', { name: "Restaurer l'état précédent" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open settings' }),
    );

    const restore = screen.getByRole('button', {
      name: "Restaurer l'état précédent",
    });
    await userEvent.click(restore);

    expect(backup.restorePreviousBackup).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: "Restaurer l'état précédent" }),
    ).not.toBeInTheDocument();
  });

  it('rejects an oversized file before reading it and cancels the old preview', async () => {
    renderPage();

    await uploadBackup();
    expect(
      await screen.findByRole('heading', { name: 'Aperçu du fichier' }),
    ).toBeInTheDocument();

    const file = new File(['{}'], 'huge.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'size', {
      value: backup.MAX_BACKUP_BYTES + 1,
    });
    const text = vi.fn();
    Object.defineProperty(file, 'text', { value: text });

    await userEvent.upload(
      screen.getByLabelText('Choisir un fichier de sauvegarde'),
      file,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /trop volumineux/i,
    );
    expect(text).not.toHaveBeenCalled();
    expect(backup.parseBackup).toHaveBeenCalledTimes(1);
    expect(backup.applyBackup).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Aperçu du fichier' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the newest import when an older file finishes reading later', async () => {
    const backupB: StudyBackup = {
      ...BACKUP,
      data: { ...STUDY_DATA, readingSessions: STUDY_DATA.readingSessions },
    };
    const backupA: StudyBackup = {
      ...BACKUP,
      data: {
        ...STUDY_DATA,
        readingSessions: STUDY_DATA.readingSessions.slice(0, 1),
      },
    };
    vi.mocked(backup.parseBackup).mockImplementation((input) =>
      input === 'A' ? backupA : backupB,
    );

    let resolveA: (text: string) => void = () => undefined;
    let resolveB: (text: string) => void = () => undefined;
    const fileA = new File(['A'], 'a.json', { type: 'application/json' });
    const fileB = new File(['B'], 'b.json', { type: 'application/json' });
    Object.defineProperty(fileA, 'text', {
      value: () => new Promise<string>((resolve) => (resolveA = resolve)),
    });
    Object.defineProperty(fileB, 'text', {
      value: () => new Promise<string>((resolve) => (resolveB = resolve)),
    });

    renderPage();
    const input = screen.getByLabelText('Choisir un fichier de sauvegarde');

    await userEvent.upload(input, fileA);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Lecture du fichier…',
    );

    await userEvent.upload(input, fileB);
    await act(async () => {
      resolveB('B');
    });
    expect(
      await screen.findByRole('heading', { name: 'Aperçu du fichier' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 séances de lecture')).toBeInTheDocument();

    await act(async () => {
      resolveA('A');
    });

    expect(screen.getByText('2 séances de lecture')).toBeInTheDocument();
    expect(screen.queryByText('1 séance de lecture')).not.toBeInTheDocument();
  });

  it('keeps the current settings when the file is not a valid backup', async () => {
    vi.mocked(backup.parseBackup).mockImplementation(() => {
      throw new Error('Unsupported format');
    });
    renderPage();

    await uploadBackup('{"format":"something-else"}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /n'est pas une sauvegarde valide/,
    );
    expect(
      screen.queryByRole('heading', { name: 'Aperçu du fichier' }),
    ).not.toBeInTheDocument();
    expect(backup.applyBackup).not.toHaveBeenCalled();
    expect(
      screen.getByRole('slider', { name: 'Articles à terminer par jour' }),
    ).toBeInTheDocument();
  });

  it('asks for confirmation before replacing, applies imported settings, then restores the previous state', async () => {
    const user = userEvent.setup();
    const replacedData: StudyData = {
      ...STUDY_DATA,
      settings: { ...STUDY_DATA.settings, uiLanguage: 'zh', theme: 'dark' },
    };
    vi.mocked(backup.readStudyData)
      .mockReturnValue(replacedData);
    renderPage();

    await uploadBackup();
    await user.click(
      screen.getByRole('button', { name: 'Remplacer mes données' }),
    );

    expect(backup.applyBackup).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Remplacer toutes les données ?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(backup.applyBackup).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', {
        name: 'Remplacer toutes les données ?',
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Remplacer mes données' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmer le remplacement' }),
    );

    expect(backup.applyBackup).toHaveBeenCalledWith(BACKUP, 'replace');
    expect(
      await screen.findByRole('heading', { level: 1, name: '设置' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');

    const restore = screen.getByRole('button', {
      name: '恢复替换前的数据',
    });
    vi.mocked(backup.readStudyData).mockReturnValue(STUDY_DATA);
    await user.click(restore);

    expect(backup.restorePreviousBackup).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paramètres' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '恢复替换前的数据' }),
    ).not.toBeInTheDocument();
  });

  it('syncs WebDAV in the native app, disabling the action while busy', async () => {
    const user = userEvent.setup();
    vi.mocked(runtime.isNativeApp).mockReturnValue(true);
    vi.mocked(webdav.loadWebDavSettings).mockReturnValue({
      url: 'https://dav.example.com/study',
      username: 'alice',
    });
    let resolveSync: (value: { syncedAt: string }) => void = () => undefined;
    vi.mocked(webdav.syncWebDav).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );
    renderPage();

    const region = screen.getByRole('region', {
      name: 'Synchronisation WebDAV',
    });
    expect(
      within(region).getByLabelText('Adresse du dossier WebDAV'),
    ).toHaveValue('https://dav.example.com/study');
    expect(within(region).getByLabelText("Nom d'utilisateur")).toHaveValue(
      'alice',
    );
    expect(within(region).getByLabelText('Mot de passe')).toHaveValue('');

    await user.type(
      within(region).getByLabelText('Mot de passe'),
      'session-secret',
    );
    const syncButton = within(region).getByRole('button', {
      name: 'Synchroniser',
    });
    await user.click(syncButton);

    expect(syncButton).toBeDisabled();
    expect(syncButton).toHaveTextContent('Synchronisation…');
    expect(webdav.syncWebDav).toHaveBeenCalledWith({
      url: 'https://dav.example.com/study',
      username: 'alice',
      password: 'session-secret',
    });
    expect(webdav.saveWebDavSettings).toHaveBeenCalledWith({
      url: 'https://dav.example.com/study',
      username: 'alice',
    });

    await act(async () => {
      resolveSync({ syncedAt: '2026-11-12T10:30:00.000Z' });
    });

    await waitFor(() => expect(syncButton).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent(/Synchronisé à/);
  });

  it('maps a WebDAV authentication failure to a clear message', async () => {
    const user = userEvent.setup();
    vi.mocked(runtime.isNativeApp).mockReturnValue(true);
    vi.mocked(webdav.loadWebDavSettings).mockReturnValue({
      url: 'https://dav.example.com/study',
      username: 'alice',
    });
    vi.mocked(webdav.syncWebDav).mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { code: 'auth' }),
    );
    renderPage();

    const region = screen.getByRole('region', {
      name: 'Synchronisation WebDAV',
    });
    await user.type(
      within(region).getByLabelText('Mot de passe'),
      'wrong-password',
    );
    await user.click(
      within(region).getByRole('button', { name: 'Synchroniser' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Nom d'utilisateur ou mot de passe refusé.",
    );
    expect(
      within(region).getByRole('button', { name: 'Synchroniser' }),
    ).toBeEnabled();
  });

  it('includes vocabulary in the import preview', async () => {
    vi.mocked(backup.parseBackup).mockReturnValue({
      ...BACKUP,
      data: { ...STUDY_DATA, vocabulary: [VOCABULARY_ENTRY] },
    });
    renderPage();

    await uploadBackup();

    expect(
      await screen.findByRole('heading', { name: 'Aperçu du fichier' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 mot dans le carnet')).toBeInTheDocument();
  });

  it('applies and persists an explicit theme', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Sombre' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ theme: 'dark' });
    expect(
      screen.getByRole('button', { name: 'Sombre' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Système' }));
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ theme: 'system' });
  });

  it('switches the whole page to Chinese', async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '设置' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '每日目标' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '外观' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '关于' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出备份' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('选择备份文件')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '打开帮助' }),
    ).toHaveAttribute('href', '/aide');
    expect(
      screen.getByRole('link', { name: '许可与来源' }),
    ).toHaveAttribute('href', '/licences');
    expect(
      screen.queryByRole('heading', { name: 'WebDAV 同步' }),
    ).not.toBeInTheDocument();
  });
});

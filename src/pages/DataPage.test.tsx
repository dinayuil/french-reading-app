import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import DataPage from './DataPage';
import { i18n } from '../i18n';
import * as backup from '../features/data/backup';
import * as files from '../platform/files';
import * as runtime from '../platform/runtime';
import * as webdav from '../features/sync/webdav';
import type { StudyBackup, StudyData } from '../features/data/backup';

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
}));

vi.mock('../platform/runtime', () => ({
  isNativeApp: vi.fn(),
}));

vi.mock('../features/sync/webdav', () => ({
  syncWebDav: vi.fn(),
  loadWebDavSettings: vi.fn(),
  saveWebDavSettings: vi.fn(),
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

function renderPage() {
  return render(
    <MemoryRouter>
      <DataPage />
    </MemoryRouter>,
  );
}

function DataNavigationHarness() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate('/')}>
        Leave data
      </button>
      <Routes>
        <Route
          path="/"
          element={
            <button type="button" onClick={() => navigate('/data')}>
              Open data
            </button>
          }
        />
        <Route path="/data" element={<DataPage />} />
      </Routes>
    </>
  );
}

function renderPageWithNavigation() {
  return render(
    <MemoryRouter initialEntries={['/data']}>
      <DataNavigationHarness />
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

function summaryRegion() {
  return screen.getByRole('region', { name: 'Votre activité' });
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
  vi.mocked(webdav.loadWebDavSettings).mockReturnValue({
    url: '',
    username: '',
  });
});

describe('DataPage', () => {
  it('shows the local study summary and no WebDAV controls on the web', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Mes données' }),
    ).toBeInTheDocument();

    const summary = within(summaryRegion());
    expect(summary.getByText('Temps de lecture')).toBeInTheDocument();
    expect(summary.getByText('1 h 30')).toBeInTheDocument();
    expect(summary.getByText('Articles lus')).toBeInTheDocument();
    expect(summary.getByText('3')).toBeInTheDocument();
    expect(summary.getByText('Exercices terminés')).toBeInTheDocument();
    expect(summary.getByText('2')).toBeInTheDocument();
    expect(summary.getByText('Taux de réussite')).toBeInTheDocument();
    expect(summary.getByText(/78/)).toBeInTheDocument();

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
  });

  it('shows a dash for accuracy before any answer is recorded', () => {
    vi.mocked(backup.getStudySummary).mockReturnValue({
      ...SUMMARY,
      correctAnswers: 0,
      totalAnswers: 0,
    });
    renderPage();

    const summary = within(summaryRegion());
    expect(summary.getByText('Taux de réussite')).toBeInTheDocument();
    expect(summary.getByText('—')).toBeInTheDocument();
  });

  it('exports the backup with a recognizable filename and reports the result', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Exporter mes données' }),
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
      screen.getByRole('button', { name: 'Exporter mes données' }),
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
      screen.getByRole('button', { name: 'Leave data' }),
    );
    expect(
      screen.queryByRole('button', { name: "Restaurer l'état précédent" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open data' }),
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

  it('keeps the current data when the file is not a valid backup', async () => {
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
    expect(within(summaryRegion()).getByText('3')).toBeInTheDocument();
  });

  it('asks for confirmation before replacing, then restores the previous state', async () => {
    const user = userEvent.setup();
    const replacedData: StudyData = {
      ...STUDY_DATA,
      settings: { ...STUDY_DATA.settings, uiLanguage: 'zh' },
    };
    vi.mocked(backup.readStudyData)
      .mockReturnValueOnce(STUDY_DATA)
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
      await screen.findByRole('heading', { level: 1, name: '学习数据' }),
    ).toBeInTheDocument();

    const restore = screen.getByRole('button', {
      name: '恢复替换前的数据',
    });
    vi.mocked(backup.readStudyData).mockReturnValue(STUDY_DATA);
    await user.click(restore);

    expect(backup.restorePreviousBackup).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mes données' }),
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
    expect(backup.readStudyData).toHaveBeenCalledTimes(2);
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
    expect(backup.readStudyData).toHaveBeenCalledTimes(1);
  });

  it('switches the whole page to Chinese', async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '学习数据' }),
    ).toBeInTheDocument();
    const summary = within(screen.getByRole('region', { name: '学习概况' }));
    expect(summary.getByText('阅读时长')).toBeInTheDocument();
    expect(summary.getByText('1 小时 30 分钟')).toBeInTheDocument();
    expect(summary.getByText('已读文章')).toBeInTheDocument();
    expect(summary.getByText('完成练习')).toBeInTheDocument();
    expect(summary.getByText('答对比例')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出学习数据' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('选择备份文件'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'WebDAV 同步' }),
    ).not.toBeInTheDocument();
  });
});

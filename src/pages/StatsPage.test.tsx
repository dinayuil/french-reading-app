import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StatsPage from './StatsPage';
import { i18n } from '../i18n';
import * as backup from '../features/data/backup';
import * as files from '../platform/files';
import * as runtime from '../platform/runtime';
import * as share from '../features/share/shareCard';
import { localDateKey } from '../features/stats/statistics';
import type { StudyData } from '../features/data/backup';

vi.mock('../features/data/backup', () => ({
  readStudyData: vi.fn(),
  getStudySummary: vi.fn(),
}));

vi.mock('../platform/files', () => ({
  exportPngFile: vi.fn(),
}));

vi.mock('../platform/runtime', () => ({
  isNativeApp: vi.fn(),
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
    <MemoryRouter initialEntries={['/stats']}>
      <StatsPage />
    </MemoryRouter>,
  );
}

function summaryRegion() {
  return screen.getByRole('region', { name: 'Votre activité' });
}

function summaryValue(label: string): HTMLElement | null {
  const term = within(summaryRegion()).getByText(label);
  return term.closest('.data-summary__item')?.querySelector('dd') ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runtime.isNativeApp).mockReturnValue(false);
  vi.mocked(backup.readStudyData).mockReturnValue(STUDY_DATA);
  vi.mocked(backup.getStudySummary).mockReturnValue(SUMMARY);
  vi.mocked(files.exportPngFile).mockResolvedValue(undefined);
  vi.mocked(share.renderShareCardPng).mockResolvedValue(
    new Blob(['png'], { type: 'image/png' }),
  );
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('StatsPage', () => {
  it('shows the learning statistics and keeps goal and backup controls out of the page', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Statistiques' }),
    ).toBeInTheDocument();

    const summary = within(summaryRegion());
    expect(summary.getByText('Temps de lecture')).toBeInTheDocument();
    expect(summary.getByText('1 h 30')).toBeInTheDocument();
    expect(summary.getByText('Articles lus')).toBeInTheDocument();
    expect(summaryValue('Articles lus')).toHaveTextContent('3');
    expect(summary.getByText('Exercices terminés')).toBeInTheDocument();
    expect(summaryValue('Exercices terminés')).toHaveTextContent('2');
    expect(summary.getByText('Taux de réussite')).toBeInTheDocument();
    expect(summary.getByText(/78/)).toBeInTheDocument();

    expect(
      screen.getByRole('link', {
        name: "Modifier l'objectif dans les paramètres",
      }),
    ).toHaveAttribute('href', '/settings');

    expect(
      screen.queryByRole('slider', { name: 'Articles à terminer par jour' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Augmenter l'objectif quotidien" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Réduire l'objectif quotidien" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Apparence' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Exporter' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Importer' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Synchronisation WebDAV' }),
    ).not.toBeInTheDocument();
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

  it('shows today against the goal read-only and switches between seven and thirty days', async () => {
    const now = new Date();
    const day = localDateKey(now);
    const startedAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      10,
      0,
      0,
    ).toISOString();
    localStorage.setItem(
      'frp:settings',
      JSON.stringify({ ...SETTINGS, dailyGoal: 3 }),
    );
    vi.mocked(backup.readStudyData).mockReturnValue({
      ...STUDY_DATA,
      practiceSessions: [
        {
          id: 'today-1',
          articleId: 'article-1',
          startedAt,
          durationMs: 120_000,
          completedAt: startedAt,
          completedDay: day,
          score: 1,
          total: 1,
          answers: [{ questionId: 'q1', selectedIndex: 0, correct: true }],
          markedWords: [],
        },
        {
          id: 'today-2',
          articleId: 'article-2',
          startedAt,
          durationMs: 180_000,
          completedAt: startedAt,
          completedDay: day,
          score: 1,
          total: 1,
          answers: [{ questionId: 'q1', selectedIndex: 0, correct: true }],
          markedWords: [],
        },
        {
          id: 'today-3-same-article',
          articleId: 'article-1',
          startedAt,
          durationMs: 60_000,
          completedAt: startedAt,
          completedDay: day,
          score: 1,
          total: 1,
          answers: [{ questionId: 'q1', selectedIndex: 0, correct: true }],
          markedWords: [],
        },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('articles terminés')).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', { name: 'Articles à terminer par jour' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Augmenter l'objectif quotidien" }),
    ).not.toBeInTheDocument();

    const chart = screen.getByRole('list', { name: 'Derniers jours' });
    expect(within(chart).getAllByRole('listitem')).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: '30 jours' }));
    expect(
      within(screen.getByRole('list', { name: 'Derniers jours' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(30);
  });

  it('creates and saves a PNG progress card and reports success', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: "Enregistrer l'image" }),
    );

    await waitFor(() => expect(files.exportPngFile).toHaveBeenCalledTimes(1));
    const [filename, blob] = vi.mocked(files.exportPngFile).mock.calls[0];
    expect(filename).toMatch(
      /^lire-en-francais-progres-\d{4}-\d{2}-\d{2}\.png$/,
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(share.buildShareCardModel).toHaveBeenCalledWith(
      expect.anything(),
      1,
      'fr',
      expect.any(Function),
    );
    expect(screen.getByText('Image enregistrée.')).toBeInTheDocument();
  });

  it('reports a failed PNG card without claiming success', async () => {
    const user = userEvent.setup();
    vi.mocked(share.renderShareCardPng).mockRejectedValueOnce(
      new Error('canvas unavailable'),
    );
    renderPage();

    await user.click(
      screen.getByRole('button', { name: "Enregistrer l'image" }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Impossible de créer ou d'enregistrer/,
    );
    expect(files.exportPngFile).not.toHaveBeenCalled();
  });

  it('does not show the account-free sales pitch in either language', async () => {
    renderPage();

    expect(
      screen.queryByText(/sans compte ni serveur/i),
    ).not.toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(
      screen.queryByText('不需要账号或服务器，就能查看阅读节奏、目标和偏好。'),
    ).not.toBeInTheDocument();
  });

  it('switches the whole page to Chinese', async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '统计' }),
    ).toBeInTheDocument();
    const summary = within(screen.getByRole('region', { name: '学习概况' }));
    expect(summary.getByText('阅读时长')).toBeInTheDocument();
    expect(summary.getByText('1 小时 30 分钟')).toBeInTheDocument();
    expect(summary.getByText('已读文章')).toBeInTheDocument();
    expect(summary.getByText('完成练习')).toBeInTheDocument();
    expect(summary.getByText('答对比例')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '保存图片' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '在设置中修改目标' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      screen.queryByRole('slider', { name: '每天完成的文章篇数' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'WebDAV 同步' }),
    ).not.toBeInTheDocument();
  });
});

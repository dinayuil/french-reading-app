import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PracticePage from './PracticePage';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { i18n } from '../i18n';
import type { Article } from '../types/content';

vi.mock('../lib/content', () => ({
  resolveArticleById: vi.fn(),
}));

vi.mock('../lib/dictionary', () => ({
  lookupFrToZh: vi.fn(),
}));

const article: Article = {
  id: '2026-11-09-tour-eiffel',
  title: 'La tour Eiffel',
  level: 'B1',
  theme: 'culture',
  date: '2026-11-09',
  summary: 'Un article de test sur la tour Eiffel.',
  paragraphs: [
    {
      sentences: [
        'La tour Eiffel est un grand monument situé à Paris.',
      ],
    },
  ],
  glossary: [{ term: 'situé' }, { term: 'Paris' }],
  questions: [
    {
      id: 'q1',
      prompt: 'Où se trouve la tour Eiffel ?',
      options: ['À Lyon', 'À Paris', 'À Nice', 'À Lille'],
      answerIndex: 1,
      evidence: 'La tour Eiffel est un grand monument situé à Paris.',
    },
    {
      id: 'q2',
      prompt: 'Quel monument est décrit ?',
      options: ['La tour Eiffel', 'Le Louvre', 'Notre-Dame', 'Le Sacré-Cœur'],
      answerIndex: 0,
      evidence: 'La tour Eiffel est un grand monument situé à Paris.',
    },
  ],
  translations: {
    zh: {
      title: '埃菲尔铁塔',
      summary: '一篇关于埃菲尔铁塔的测试文章。',
      paragraphs: [
        {
          sentences: ['埃菲尔铁塔是位于巴黎的一座大型纪念碑。'],
        },
      ],
      glossary: { situé: '位于，坐落在', Paris: '巴黎市' },
      questions: {
        q1: '文章说明铁塔位于巴黎。',
        q2: '文章标题和内容都指向埃菲尔铁塔。',
      },
    },
  },
  source: {
    site: 'Wikipédia en français',
    title: 'Tour Eiffel',
    authors: ['Contributeurs de Wikipédia'],
    url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-09',
  },
  adaptation: {
    model: 'rédaction interne',
    date: '2026-11-09',
    changes: 'Version simplifiée au niveau B1.',
    reviewer: 'révision éditoriale',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

function renderPractice(path = '/practice/2026-11-09-tour-eiffel') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/practice/:id" element={<PracticePage />} />
        <Route path="/practice" element={<PracticePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function readStoredSessions() {
  const raw = localStorage.getItem('frp:practice-sessions');
  return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
  });
}

function dispatchVisibility(state: 'visible' | 'hidden') {
  act(() => {
    setVisibility(state);
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function mockSelection(
  text: string,
  getNode: () => Node | null = () =>
    document.querySelector('[data-testid="article-body"]'),
) {
  vi.stubGlobal(
    'getSelection',
    vi.fn().mockImplementation(() => {
      const node = getNode();
      return {
        toString: () => text,
        anchorNode: node,
        focusNode: node,
        rangeCount: node ? 1 : 0,
        getRangeAt: () => ({}),
        removeAllRanges: () => {},
      };
    }),
  );
}

describe('PracticePage', () => {
  let now = 0;

  beforeEach(() => {
    localStorage.clear();
    now = 0;
    vi.mocked(resolveArticleById).mockReset();
    vi.mocked(resolveArticleById).mockResolvedValue(article);
    vi.mocked(lookupFrToZh).mockReset();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    setVisibility('visible');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setVisibility('visible');
  });

  function advanceTime(ms: number) {
    act(() => {
      now += ms;
    });
  }

  it('hides all help before submit and shows the timer by default', async () => {
    const { container } = renderPractice();

    await screen.findByRole('heading', { name: article.title });

    expect(container.querySelector('.gloss-term')).toBeNull();
    expect(
      screen.queryByText(
        article.translations.zh.paragraphs[0].sentences[0],
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.summary),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Traduction chinoise' }),
    ).not.toBeInTheDocument();
    expect(lookupFrToZh).not.toHaveBeenCalled();

    expect(screen.queryByText(article.summary)).not.toBeInTheDocument();
    expect(screen.getByTestId('practice-timer')).toHaveTextContent('0 s');
    expect(screen.getByRole('radio', { name: 'À Paris' })).not.toBeChecked();
  });

  it('shows the Global Voices attribution before submitting', async () => {
    vi.mocked(resolveArticleById).mockResolvedValue({
      ...article,
      source: {
        ...article.source,
        site: 'Global Voices en Français',
        authors: ['Mamisoa Raveloaritiana'],
        url: 'https://fr.globalvoices.org/2026/11/09/304239/',
        license: 'CC BY 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
        retrievedAt: '2026-11-10',
        publishedAt: '2026-11-09',
        attributionPosition: 'top',
      },
    });

    const { container } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    const top = container.querySelector('.global-voices-attribution');
    expect(top).not.toBeNull();
    expect(top).toHaveTextContent('Mamisoa Raveloaritiana');
    expect(top).toHaveTextContent('2026-11-09');
  });

  it('shows a single-sentence intro with the question count and a rules link', async () => {
    renderPractice();

    await screen.findByRole('heading', { name: article.title });

    const intro = screen.getByText(/Lisez l'article en français/);
    expect(intro).toHaveTextContent(
      "Lisez l'article en français, puis répondez aux questions (2). Voir les règles",
    );
    expect(screen.queryByText(/交卷前不提供/)).not.toBeInTheDocument();
    const rulesLink = screen.getByRole('link', { name: 'Voir les règles' });
    expect(rulesLink).toHaveAttribute('href', '/aide');
    expect(rulesLink).toHaveAttribute('target', '_blank');
    expect(rulesLink.getAttribute('rel')).toContain('noopener');
    expect(rulesLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('switches the practice UI to Chinese while keeping the article in French', async () => {
    mockSelection('flâner');

    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    expect(screen.getByText('Mode exercice')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Questions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(screen.getByText('练习模式')).toBeInTheDocument();
    expect(screen.getByText('文化')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '显示计时' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '题目' })).toBeInTheDocument();
    expect(screen.getByText('第 1 题')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: article.title }),
    ).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('radio', { name: 'À Paris' })).toBeChecked();

    await userEvent.click(
      screen.getByRole('button', { name: '显示计时' }),
    );
    expect(screen.getByTestId('practice-timer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '隐藏计时' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('article-body'));
    expect(await screen.findByTestId('mark-word')).toHaveTextContent('标记');

    await userEvent.click(screen.getByRole('button', { name: '交卷' }));

    expect(screen.getByText('得分：1 / 2')).toBeInTheDocument();
    expect(screen.getAllByText('回答正确')).toHaveLength(1);
    expect(screen.getAllByText('回答错误')).toHaveLength(1);
    expect(screen.getAllByText(/原文依据：/)).toHaveLength(2);
    expect(screen.getByText(/你的选择：\s*未作答/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'situé：位于，坐落在' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '中文对照' }));

    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.summary),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.paragraphs[0].sentences[0]),
    ).toBeInTheDocument();
  });

  it('shows the loading state while the article is fetched', () => {
    vi.mocked(resolveArticleById).mockReturnValue(
      new Promise<Article>(() => {}),
    );

    renderPractice();

    expect(screen.getByRole('status')).toHaveTextContent(
      "Chargement de l'exercice…",
    );
  });

  it('shows a localized error with the raw technical detail when loading fails', async () => {
    vi.mocked(resolveArticleById).mockRejectedValue(new Error('network down'));

    renderPractice();

    expect(
      await screen.findByRole('heading', {
        name: "Impossible de charger l'exercice",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vérifiez votre connexion, puis réessayez.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Détail technique')).toBeInTheDocument();
    expect(screen.getByText('network down')).toBeInTheDocument();
  });

  it('reports a missing article id in the error detail', async () => {
    renderPractice('/practice');

    expect(
      await screen.findByRole('heading', {
        name: "Impossible de charger l'exercice",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identifiant d'article manquant"),
    ).toBeInTheDocument();
  });

  it('hides the timer display without stopping the count and persists the setting', async () => {
    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    await userEvent.click(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    );

    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Afficher le chronomètre' }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('frp:settings') ?? '{}')).toMatchObject({
      practiceTimerVisible: false,
    });

    advanceTime(3_000);
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(2_900);
  });

  it('freezes the displayed timer at submit time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    act(() => {
      now += 1_000;
      vi.advanceTimersByTime(1_000);
    });
    await user.click(screen.getByRole('button', { name: 'Valider mes réponses' }));

    expect(screen.getByTestId('practice-timer')).toHaveTextContent('1 s');

    act(() => {
      now += 4_000;
      vi.advanceTimersByTime(4_000);
    });

    expect(screen.getByTestId('practice-timer')).toHaveTextContent('1 s');
  });

  it('does not offer marking for selections outside the article', async () => {
    mockSelection('Paris', () => document.querySelector('h1'));

    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));

    expect(screen.queryByTestId('mark-word')).not.toBeInTheDocument();
  });

  it('defaults to a visible timer when stored settings are corrupt', async () => {
    localStorage.setItem('frp:settings', 'null');

    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    expect(screen.getByTestId('practice-timer')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    );

    expect(JSON.parse(localStorage.getItem('frp:settings') ?? '{}')).toMatchObject({
      practiceTimerVisible: false,
    });
  });

  it('preserves the other settings when toggling the timer', async () => {
    localStorage.setItem(
      'frp:settings',
      JSON.stringify({
        uiLanguage: 'zh',
        onboardingSeen: true,
        practiceTimerVisible: true,
      }),
    );

    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    );

    expect(JSON.parse(localStorage.getItem('frp:settings') ?? '{}')).toMatchObject({
      uiLanguage: 'zh',
      onboardingSeen: true,
      practiceTimerVisible: false,
    });
  });

  it('marks a selected word and saves it with the practice session', async () => {
    mockSelection('flâner');

    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(await screen.findByTestId('mark-word'));

    expect(screen.getByText('flâner')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].markedWords).toEqual(['flâner']);
  });

  it('scores answers and unlocks explanations, glossary and translations after submit', async () => {
    renderPractice();

    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(
      screen.getByRole('radio', { name: 'La tour Eiffel' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText('Score : 2 / 2')).toBeInTheDocument();
    expect(screen.getByText(article.summary)).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.summary),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q2),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Justification :/)).toHaveLength(2);

    await userEvent.click(
      screen.getByRole('button', { name: 'situé : 位于，坐落在' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Vocabulaire et traduction',
    });
    expect(panel).toHaveTextContent('位于，坐落在');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Traduire' })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );
    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.summary),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.paragraphs[0].sentences[0]),
    ).toBeInTheDocument();
  });

  it('saves exactly one session with the duration frozen at submit time', async () => {
    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    advanceTime(2_000);
    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    advanceTime(5_000);
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      articleId: article.id,
      score: 1,
      total: 2,
      markedWords: [],
    });
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(1_900);
    expect(sessions[0].durationMs).toBeLessThanOrEqual(2_100);
    expect(sessions[0].answers).toEqual([
      { questionId: 'q1', selectedIndex: 1, correct: true },
      { questionId: 'q2', selectedIndex: null, correct: false },
    ]);
  });

  it('writes nothing on unmount when the practice was never submitted', async () => {
    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });

    advanceTime(3_000);
    unmount();

    expect(localStorage.getItem('frp:practice-sessions')).toBeNull();
  });

  it('keeps counting while the tab is hidden', async () => {
    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    advanceTime(1_000);
    dispatchVisibility('hidden');
    advanceTime(2_000);
    dispatchVisibility('visible');
    advanceTime(1_000);

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(3_900);
    expect(sessions[0].durationMs).toBeLessThanOrEqual(4_100);
  });

  it('starts counting when the practice page mounts in a hidden tab', async () => {
    setVisibility('hidden');

    const { unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    advanceTime(2_000);
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(1_900);
    expect(sessions[0].durationMs).toBeLessThanOrEqual(2_100);
  });

  it('ignores a stale translation result after switching terms', async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(lookupFrToZh).mockImplementationOnce(() => first);

    renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    await userEvent.click(screen.getByRole('button', { name: /situé/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Traduire' }));
    expect(screen.getByText('Recherche en cours…')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Paris/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('巴黎市');

    await act(async () => {
      resolveFirst('旧翻译');
      await first;
    });

    expect(screen.queryByText('旧翻译')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('巴黎市');
  });
});

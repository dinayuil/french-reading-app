import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PracticePage from './PracticePage';
import ReadPage from './ReadPage';
import { resolveArticleById, resolveArticleFamilyById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { i18n } from '../i18n';
import { readStudyData } from '../features/data/backup';
import { savePracticeSession } from '../features/data/studyData';
import {
  createPracticeDraft,
  savePracticeDraft,
} from '../features/practice/practiceDraft';
import { listVocabulary } from '../features/vocabulary/vocabulary';
import {
  listArticleMarks,
  setArticleMark,
} from '../features/marks/articleMarks';
import type { Article, ArticleImage } from '../types/content';

vi.mock('../lib/content', () => ({
  resolveArticleById: vi.fn(),
  resolveArticleFamilyById: vi.fn(),
  resolveImageUrl: vi.fn((path: string) => `/data/${path}`),
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
      explanation:
        'Le texte indique que la tour Eiffel se trouve à Paris.',
    },
    {
      id: 'q2',
      prompt: 'Quel monument est décrit ?',
      options: ['La tour Eiffel', 'Le Louvre', 'Notre-Dame', 'Le Sacré-Cœur'],
      answerIndex: 0,
      evidence: 'La tour Eiffel est un grand monument situé à Paris.',
      explanation:
        'Le titre et le texte décrivent tous les deux la tour Eiffel.',
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
      questionTexts: {
        q1: {
          prompt: '埃菲尔铁塔在哪里？',
          options: [
            '在里昂，罗讷河附近',
            '在巴黎，塞纳河畔',
            '在大西洋海岸',
            '在法国南部',
          ],
        },
        q2: {
          prompt: '文中描述的是哪座纪念碑？',
          options: ['这座铁塔', '卢浮宫', '巴黎圣母院', '圣心堂'],
        },
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

const articleImage: ArticleImage = {
  path: 'images/2026-11-09-tour-eiffel-0123456789ab.jpg',
  alt: 'La tour Eiffel vue depuis le Champ-de-Mars',
  author: 'Jane Doe',
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Champ_de_Mars.jpg?oldid=123456789',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  changes: 'Image redimensionnée à 1200 px de large.',
  width: 1200,
  height: 800,
  byteLength: 345_678,
  sha256: '0123456789abcdef'.repeat(4),
  fileRevisionId: '123456789',
  retrievedAt: '2026-11-14',
};

function legacyArticle(): Article {
  const legacyTranslation = { ...article.translations.zh };
  delete legacyTranslation.questionTexts;

  return {
    ...article,
    questions: article.questions.map((question) => {
      const legacyQuestion = { ...question };
      delete legacyQuestion.explanation;
      return legacyQuestion;
    }),
    translations: {
      zh: legacyTranslation,
    },
  };
}

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

function renderRead(path = '/read/2026-11-09-tour-eiffel') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/read/:id" element={<ReadPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function readStoredSessions() {
  return readStudyData().practiceSessions;
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
  let selectedText = text;
  const selection = {
    toString: () => selectedText,
    get anchorNode() {
      return selectedText ? getNode() : null;
    },
    get focusNode() {
      return selectedText ? getNode() : null;
    },
    get rangeCount() {
      return selectedText && getNode() ? 1 : 0;
    },
    getRangeAt: () => ({
      startContainer: getNode(),
      endContainer: getNode(),
    }),
    removeAllRanges: () => {
      selectedText = '';
    },
  };

  vi.stubGlobal('getSelection', vi.fn(() => selection));
  return selection;
}

describe('PracticePage', () => {
  let now = 0;

  beforeEach(() => {
    localStorage.clear();
    now = 0;
    vi.mocked(resolveArticleById).mockReset();
    vi.mocked(resolveArticleById).mockResolvedValue(article);
    vi.mocked(resolveArticleFamilyById).mockReset();
    vi.mocked(resolveArticleFamilyById).mockResolvedValue({ article, versions: [] });
    vi.mocked(lookupFrToZh).mockReset();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    setVisibility('visible');
    window.getSelection()?.removeAllRanges();
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
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.questions[0].explanation!),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(lookupFrToZh).not.toHaveBeenCalled();

    expect(screen.queryByText(article.summary)).not.toBeInTheDocument();
    expect(screen.getByTestId('practice-timer')).toHaveTextContent('0 s');
    expect(screen.getByRole('radio', { name: 'À Paris' })).not.toBeChecked();
  });

  it('shows the article image only after submitting the practice', async () => {
    vi.mocked(resolveArticleById).mockResolvedValue({
      ...article,
      image: articleImage,
    });

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });

    expect(container.querySelector('figure')).toBeNull();
    expect(
      screen.queryByRole('img', { name: articleImage.alt }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    const figure = screen.getByTestId('article-image');
    expect(figure.nextElementSibling).toBe(screen.getByTestId('article-body'));
    expect(
      screen.getByRole('img', { name: articleImage.alt }),
    ).toHaveAttribute('src', `/data/${articleImage.path}`);
    expect(
      screen.getByRole('link', { name: articleImage.license }),
    ).toHaveAttribute('href', articleImage.licenseUrl);
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
      screen.getByText(article.questions[0].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.questions[1].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.questions[0].explanation!),
    ).not.toBeInTheDocument();
  });

  it('shows the final frozen time after submitting even when the realtime timer was hidden', async () => {
    renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await act(async () => {});

    await userEvent.click(
      screen.getByRole('button', { name: 'Masquer le chronomètre' }),
    );
    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();

    advanceTime(2_000);
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByTestId('practice-timer')).toHaveTextContent('2 s');
    expect(screen.getByTestId('practice-timer')).toHaveAttribute(
      'aria-label',
      "Temps final de l'exercice",
    );
    expect(
      screen.queryByRole('button', { name: 'Afficher le chronomètre' }),
    ).not.toBeInTheDocument();
  });

  it('starts a fresh attempt from the retry action', async () => {
    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: "Refaire l'exercice" }),
    );

    expect(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Score : 1 / 2')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'À Paris' })).not.toBeChecked();
    expect(screen.getByTestId('practice-timer')).toHaveTextContent('0 s');
    expect(readStoredSessions()).toHaveLength(1);
  });

  it('never adds a marked word automatically and adds it explicitly after submit', async () => {
    mockSelection('flâner');
    renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByTestId('article-body'));

    expect(screen.queryByRole('button', { name: 'Ajouter au carnet' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Traduire la sélection' }),
    ).not.toBeInTheDocument();

    await userEvent.click(await screen.findByTestId('mark-word'));
    expect(screen.getByText('flâner')).toBeInTheDocument();
    expect(listVocabulary()).toHaveLength(0);

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Ajouter au carnet : flâner',
      }),
    );

    expect(listVocabulary()).toHaveLength(1);
    expect(listVocabulary()[0]).toMatchObject({
      term: 'flâner',
      articleId: article.id,
      articleTitle: article.title,
    });
  });

  it('adds a marked word with the original source sentence after submit', async () => {
    mockSelection('monument');
    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(await screen.findByTestId('mark-word'));

    expect(listVocabulary()).toHaveLength(0);

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Ajouter au carnet : monument' }),
    );

    expect(listVocabulary()[0]).toMatchObject({
      term: 'monument',
      context: 'La tour Eiffel est un grand monument situé à Paris.',
      articleId: article.id,
      articleTitle: article.title,
    });
  });

  it('unlocks bulk saving marked terms after submit', async () => {
    await i18n.changeLanguage('zh');
    setArticleMark(article.id, 'Paris', true);
    setArticleMark(article.id, 'grand monument', true);
    renderPractice();
    const marks = within(await screen.findByRole('region', { name: '已标记词语' }));
    const bulkButton = { name: '全部加入单词本' };
    expect(marks.queryByRole('button', bulkButton)).not.toBeInTheDocument();
    expect(marks.queryByRole('button', { name: '把“Paris”加入单词本' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '交卷' }));
    expect(listVocabulary()).toEqual([]);
    await userEvent.click(marks.getByRole('button', bulkButton));

    expect(listVocabulary().map((entry) => entry.term).sort()).toEqual([
      'Paris',
      'grand monument',
    ]);
    expect(marks.getByRole('button', bulkButton)).toBeDisabled();
    expect(marks.getByRole('button', { name: '从单词本移除“Paris”' })).toBeEnabled();
    expect(marks.getByRole('button', { name: '从单词本移除“grand monument”' })).toBeEnabled();
  });

  it('keeps both saved word controls on minus and removes a word without unmarking it', async () => {
    setArticleMark(article.id, 'Paris', true);
    setArticleMark(article.id, 'monument', true);
    renderPractice();
    await userEvent.click(await screen.findByRole('button', { name: 'Valider mes réponses' }));
    const marks = within(screen.getByRole('region', { name: 'Mots marqués' }));

    await userEvent.click(marks.getByRole('button', { name: 'Ajouter au carnet : Paris' }));
    await userEvent.click(marks.getByRole('button', { name: 'Ajouter au carnet : monument' }));
    const removeParis = marks.getByRole('button', { name: 'Retirer du carnet : Paris' });
    const removeMonument = marks.getByRole('button', { name: 'Retirer du carnet : monument' });
    expect(removeParis).toHaveTextContent('−');
    expect(removeMonument).toHaveTextContent('−');

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    await userEvent.click(removeParis);
    expect(marks.getByRole('alert')).toHaveTextContent('Impossible de supprimer ce mot.');
    expect(removeParis).toHaveTextContent('−');
    expect(listVocabulary()).toHaveLength(2);

    setItem.mockRestore();
    await userEvent.click(removeParis);
    expect(marks.queryByRole('alert')).not.toBeInTheDocument();
    expect(marks.getByRole('button', { name: 'Ajouter au carnet : Paris' })).toHaveTextContent('+');
    expect(removeMonument).toHaveTextContent('−');
    expect(listVocabulary().map((entry) => entry.term)).toEqual(['monument']);
    expect(listArticleMarks(article.id).sort()).toEqual(['Paris', 'monument']);
    expect(marks.getByRole('button', { name: 'Tout ajouter au carnet' })).toBeEnabled();
  });

  it('adds a post-submit glossary term with its original source sentence', async () => {
    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /situé :/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Ajouter au carnet' }),
    );

    expect(listVocabulary()[0]).toMatchObject({
      term: 'situé',
      context: 'La tour Eiffel est un grand monument situé à Paris.',
    });
  });

  it('adds a post-submit selection to the notebook with its source sentence', async () => {
    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    mockSelection('Paris', () =>
      document.querySelector('.sentence-fr'),
    );
    await userEvent.click(screen.getByTestId('article-body'));
    const add = await screen.findByRole('button', {
      name: 'Ajouter au carnet',
    });
    await userEvent.click(add);

    expect(listVocabulary()[0]).toMatchObject({
      term: 'Paris',
      context: 'La tour Eiffel est un grand monument situé à Paris.',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Ajouté au carnet.');
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

  it('marks before submit, highlights the word and stores it in the shared collection', async () => {
    mockSelection('monument');

    const { container, unmount } = renderPractice();

    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(await screen.findByTestId('mark-word'));

    const highlights = container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('monument');
    expect(listArticleMarks(article.id)).toEqual(['monument']);
    expect(listVocabulary()).toHaveLength(0);
    expect(container.querySelector('.gloss-term')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Mots marqués' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].markedWords).toEqual([]);
    expect(listArticleMarks(article.id)).toEqual(['monument']);
  });

  it('offers to remove an already marked word before submitting', async () => {
    mockSelection('monument');

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(await screen.findByTestId('mark-word'));

    mockSelection('monument');
    await userEvent.click(screen.getByTestId('article-body'));

    const unmark = await screen.findByTestId('unmark-word');
    expect(unmark).toHaveTextContent('Retirer la marque');
    await userEvent.click(unmark);

    expect(container.querySelector('.mark-highlight')).toBeNull();
    expect(listArticleMarks(article.id)).toEqual([]);
    expect(
      screen.queryByRole('region', { name: 'Mots marqués' }),
    ).not.toBeInTheDocument();
  });

  it('selects a highlighted word by clicking it before submit without unlocking lookup actions', async () => {
    act(() => {
      setArticleMark(article.id, 'monument', true);
    });

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(
      container.querySelector<HTMLElement>('.mark-highlight')!,
    );

    expect(await screen.findByTestId('unmark-word')).toHaveTextContent(
      'Retirer la marque',
    );
    expect(
      screen.queryByRole('button', { name: 'Traduire la sélection' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ajouter au carnet' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('monument');
  });

  it('selects a highlighted word by clicking it after submit and shows lookup actions', async () => {
    act(() => {
      setArticleMark(article.id, 'monument', true);
    });

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    await userEvent.click(
      container.querySelector<HTMLElement>('.mark-highlight')!,
    );

    expect(await screen.findByTestId('unmark-word')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Traduire la sélection' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ajouter au carnet' }),
    ).toBeInTheDocument();
  });

  it('selects a marked glossary word after submit instead of opening its explanation', async () => {
    act(() => {
      setArticleMark(article.id, 'situé', true);
    });

    renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: /situé :/ }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByTestId('unmark-word')).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('situé');
  });

  it('seeds historical practice marks into the shared highlight before submitting', async () => {
    savePracticeSession({
      id: 'practice-history',
      articleId: article.id,
      startedAt: '2026-11-01T10:00:00.000Z',
      durationMs: 60_000,
      score: 0,
      total: 2,
      answers: [],
      markedWords: ['monument'],
    });

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });

    const highlights = container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('monument');
    expect(
      within(
        screen.getByRole('region', { name: 'Mots marqués' }),
      ).getByText('monument'),
    ).toBeInTheDocument();
    expect(container.querySelector('.gloss-term')).toBeNull();
    expect(readStoredSessions()).toHaveLength(1);
  });

  it('seeds marks restored from the current practice draft', async () => {
    const draft = createPracticeDraft({
      article,
      id: 'practice-draft-marks',
      startedAt: '2026-11-01T10:00:00.000Z',
      rng: () => 0,
    });
    savePracticeDraft({ ...draft, markedWords: ['monument'] });

    const { container } = renderPractice();
    await screen.findByRole('heading', { name: article.title });

    const highlights = container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('monument');
    expect(
      screen.getByRole('region', { name: 'Mots marqués' }),
    ).toBeInTheDocument();
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
      screen.getByText(article.questions[0].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.questions[1].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q2),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q2.prompt),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q2.options[0]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q2),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.questions[0].explanation!),
    ).not.toBeInTheDocument();
  });

  it('keeps French questions after submit until the translation toggle is enabled', async () => {
    renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();
    expect(
      screen.getByText(article.questions[0].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', {
      name: 'Traduction chinoise',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();
    expect(
      screen.getByText(article.questions[0].options[1]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.questions[0].explanation!),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(article.questions[0].explanation!),
    ).toBeInTheDocument();
  });

  it('keeps French content in the Chinese UI until the translation toggle is enabled', async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    expect(screen.getByText('练习模式')).toBeInTheDocument();
    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(screen.getByRole('button', { name: '交卷' }));

    expect(screen.getByText('得分：1 / 2')).toBeInTheDocument();
    expect(
      screen.getByText(article.questions[0].explanation!),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '中文对照' }));

    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.options[1]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(article.questions[0].explanation!),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /À Paris/ }),
    ).toBeChecked();
  });

  it('keeps the translation toggle, selections, score and saved session when the UI language changes', async () => {
    renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    const sessionsBefore = readStoredSessions();
    expect(sessionsBefore).toHaveLength(1);

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(
      screen.getByRole('button', { name: '中文对照' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /À Paris/ })).toBeChecked();
    expect(screen.getByText('得分：1 / 2')).toBeInTheDocument();
    expect(readStoredSessions()).toEqual(sessionsBefore);

    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    expect(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(article.translations.zh.questionTexts!.q1.prompt),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /À Paris/ })).toBeChecked();
    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();
    expect(readStoredSessions()).toEqual(sessionsBefore);
  });

  it('translates the wrong selected answer without changing the score', async () => {
    renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('radio', { name: 'À Lyon' }));
    await userEvent.click(
      screen.getByRole('radio', { name: 'La tour Eiffel' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    const yourAnswer = screen.getByText(/Votre réponse/);
    expect(yourAnswer).toHaveTextContent('À Lyon');
    expect(yourAnswer).toHaveTextContent('在里昂，罗讷河附近');
    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();
    const evidenceQuotes = screen.getAllByText(article.questions[0].evidence);
    expect(evidenceQuotes).toHaveLength(2);
    evidenceQuotes.forEach((quote) => {
      expect(quote).toHaveAttribute('lang', 'fr');
    });
    expect(readStoredSessions()[0].answers[0]).toEqual({
      questionId: 'q1',
      selectedIndex: 0,
      correct: false,
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    expect(screen.getByText(/Votre réponse/)).not.toHaveTextContent(
      '在里昂，罗讷河附近',
    );
    expect(screen.getByText(/Votre réponse/)).toHaveTextContent('À Lyon');
    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();
  });

  it('keeps legacy evidence without an explanation until translation is enabled', async () => {
    vi.mocked(resolveArticleById).mockResolvedValue(legacyArticle());
    const { container } = renderPractice();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText('Score : 0 / 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Justification :/)).toHaveLength(2);
    expect(
      container.querySelectorAll('.practice-feedback__explanation'),
    ).toHaveLength(0);
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();
    expect(
      container.querySelectorAll('.practice-feedback__explanation'),
    ).toHaveLength(2);
    expect(
      screen.getByText(article.translations.zh.questions.q1),
    ).toHaveAttribute('lang', 'zh-CN');
    expect(
      screen.getByText(article.translations.zh.questions.q2),
    ).toHaveAttribute('lang', 'zh-CN');
    expect(
      screen.queryByText(article.translations.zh.questionTexts!.q1.prompt),
    ).not.toBeInTheDocument();
    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    expect(
      container.querySelectorAll('.practice-feedback__explanation'),
    ).toHaveLength(0);
    expect(
      screen.queryByText(article.translations.zh.questions.q1),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/Justification :/)).toHaveLength(2);
    expect(screen.getByText(article.questions[0].prompt)).toBeInTheDocument();
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

    const immediately = readStoredSessions();
    expect(immediately).toHaveLength(1);
    expect(immediately[0].id).toEqual(expect.any(String));

    advanceTime(5_000);
    unmount();

    const sessions = readStoredSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(immediately[0].id);
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

  it('keeps answers and the selection when saving fails, then retries', async () => {
    mockSelection('flâner');
    renderPractice();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByRole('radio', { name: 'À Paris' }));
    await userEvent.click(screen.getByTestId('article-body'));
    expect(await screen.findByTestId('mark-word')).toBeInTheDocument();

    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === 'frp:study-data') {
          throw new Error('quota exceeded');
        }
        originalSetItem.call(this, key, value);
      });

    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Impossible d'enregistrer vos réponses. Réessayez.",
    );
    expect(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Score : 1 / 2')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'À Paris' })).toBeChecked();
    expect(screen.getByTestId('mark-word')).toBeInTheDocument();
    expect(readStoredSessions()).toHaveLength(0);

    setItem.mockRestore();
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText('Score : 1 / 2')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mark-word')).not.toBeInTheDocument();
  });

  it('clears the old selection after submit and still allows a new one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPractice();
    await act(async () => {});
    expect(
      screen.getByRole('heading', { name: article.title }),
    ).toBeInTheDocument();

    const oldSelection = mockSelection('flâner');
    const articleBody = screen.getByTestId('article-body');

    act(() => {
      articleBody.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(screen.getByTestId('mark-word')).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    await user.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    expect(screen.getByText('Score : 0 / 2')).toBeInTheDocument();
    expect(screen.queryByTestId('mark-word')).not.toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('mark-word')).not.toBeInTheDocument();
    expect(oldSelection.toString()).toBe('');

    mockSelection('relire');
    act(() => {
      articleBody.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(screen.getByTestId('mark-word')).toBeInTheDocument();
    await user.click(screen.getByTestId('mark-word'));

    expect(listArticleMarks(article.id)).toContain('relire');
    expect(readStoredSessions()[0].markedWords).toEqual([]);
  });

  it('keeps the selection when marking fails, then retries', async () => {
    renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Valider mes réponses' }),
    );

    mockSelection('flâner');
    await userEvent.click(screen.getByTestId('article-body'));
    const mark = await screen.findByTestId('mark-word');

    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === 'frp:study-data') {
          throw new Error('quota exceeded');
        }
        originalSetItem.call(this, key, value);
      });

    await userEvent.click(mark);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Impossible d'enregistrer la marque. Réessayez.",
    );
    expect(screen.getByTestId('mark-word')).toBeInTheDocument();

    setItem.mockRestore();
    await userEvent.click(screen.getByTestId('mark-word'));

    expect(await screen.findByText('flâner')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listArticleMarks(article.id)).toContain('flâner');
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

  it('shows marks from a valid legacy draft in reading and does not revive them after removal', async () => {
    const draft = createPracticeDraft({
      article,
      id: 'practice-draft-legacy-marks',
      startedAt: '2026-11-01T10:00:00.000Z',
      rng: () => 0,
    });
    savePracticeDraft({ ...draft, markedWords: ['monument'] });

    const reading = renderRead();
    await screen.findByRole('heading', { name: article.title });

    const highlights = reading.container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('monument');

    const markedRegion = screen.getByRole('region', {
      name: 'Mots marqués',
    });
    await userEvent.click(
      within(markedRegion).getByRole('button', {
        name: 'Retirer la marque de « monument »',
      }),
    );

    expect(reading.container.querySelector('.mark-highlight')).toBeNull();
    expect(listArticleMarks(article.id, ['monument'])).toEqual([]);
    reading.unmount();

    const practice = renderPractice();
    await screen.findByRole('heading', { name: article.title });
    expect(practice.container.querySelector('.mark-highlight')).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Mots marqués' }),
    ).not.toBeInTheDocument();
  });

  it('shares marks between practice and reading, and removal survives remounts', async () => {
    mockSelection('monument');

    const practice = renderPractice();
    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(await screen.findByTestId('mark-word'));

    expect(listVocabulary()).toHaveLength(0);
    expect(listArticleMarks(article.id)).toEqual(['monument']);
    practice.unmount();

    const reading = renderRead();
    await screen.findByRole('heading', { name: article.title });

    const highlights = reading.container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('monument');

    const markedRegion = screen.getByRole('region', {
      name: 'Mots marqués',
    });
    await userEvent.click(
      within(markedRegion).getByRole('button', {
        name: 'Retirer la marque de « monument »',
      }),
    );

    expect(reading.container.querySelector('.mark-highlight')).toBeNull();
    reading.unmount();

    const practiceAgain = renderPractice();
    await screen.findByRole('heading', { name: article.title });
    expect(practiceAgain.container.querySelector('.mark-highlight')).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Mots marqués' }),
    ).not.toBeInTheDocument();
    expect(listArticleMarks(article.id)).toEqual([]);
  });
});

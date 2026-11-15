export interface ReadingSession {
  /** Stable record identity; optional for records written before sync support. */
  id?: string;
  articleId: string;
  startedAt: string;
  durationMs: number;
}

export interface PracticeAnswer {
  questionId: string;
  selectedIndex: number | null;
  correct: boolean;
}

export interface PracticeSession {
  /** Stable record identity; optional for records written before sync support. */
  id?: string;
  articleId: string;
  startedAt: string;
  durationMs: number;
  /** Submission time; absent on records written before learning tools. */
  completedAt?: string;
  /** Local calendar day (YYYY-MM-DD) of submission; absent on old records. */
  completedDay?: string;
  score: number;
  total: number;
  answers: PracticeAnswer[];
  markedWords: string[];
}

export interface ReadingProgress {
  articleId: string;
  /** Normalized 0..1 reading position. */
  position: number;
  completed: boolean;
  updatedAt: string;
}

export type UiLanguage = 'fr' | 'zh';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  uiLanguage: UiLanguage;
  onboardingSeen: boolean;
  practiceTimerVisible: boolean;
  /** Optional so settings literals written before themes still compile. */
  theme?: ThemePreference;
  /** Daily target in articles, 1-20; optional for old settings literals. */
  dailyGoal?: number;
}

export interface VocabularyEntry {
  /** Stable id derived from the article and normalized term. */
  id: string;
  term: string;
  /** Editable Chinese translation; empty until the learner fills it in. */
  translation: string;
  /** Sentence or phrase from the source article. */
  context: string;
  articleId: string;
  articleTitle: string;
  createdAt: string;
  updatedAt: string;
  /** Tombstone time; a deleted entry stays for merge conflict resolution. */
  deletedAt?: string;
}

export interface ArticleWordMark {
  /** Stable id derived from the article and normalized term. */
  id: string;
  articleId: string;
  term: string;
  updatedAt: string;
  /** Tombstone time; a removed mark stays for merge conflict resolution. */
  deletedAt?: string;
}

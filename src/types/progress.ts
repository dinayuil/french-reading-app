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

export interface Settings {
  uiLanguage: UiLanguage;
  onboardingSeen: boolean;
  practiceTimerVisible: boolean;
}

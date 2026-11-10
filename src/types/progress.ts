export interface ReadingSession {
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
  articleId: string;
  startedAt: string;
  durationMs: number;
  score: number;
  total: number;
  answers: PracticeAnswer[];
  markedWords: string[];
}

export type UiLanguage = 'fr' | 'zh';

export interface Settings {
  uiLanguage: UiLanguage;
  onboardingSeen: boolean;
  practiceTimerVisible: boolean;
}

export type CefrLevel = 'A2' | 'B1' | 'B2';

export interface ArticleIndexEntry {
  id: string;
  title: string;
  level: CefrLevel;
  theme: string;
  date: string; // YYYY-MM-DD
  summary: string;
  path: string; // 'articles/<id>.json'
  variants?: ArticleIndexEntry[];
}

export interface Manifest {
  days: string[];
}

export interface DayIndex {
  date: string;
  articles: ArticleIndexEntry[];
}

export interface GlossaryEntry {
  term: string;
}

export interface ArticleParagraph {
  sentences: string[];
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  evidence: string; // exact sentence from the article
  explanation?: string; // French reasoning, optional for legacy articles
}

export interface QuestionTextTranslation {
  prompt: string;
  options: string[];
}

export interface ArticleTranslation {
  title: string;
  summary: string;
  paragraphs: ArticleParagraph[];
  glossary: Record<string, string>; // term -> explication
  questions: Record<string, string>; // questionId -> explication
  questionTexts?: Record<string, QuestionTextTranslation>; // questionId -> translated prompt and options
}

export interface SourceMeta {
  site: string;
  title: string;
  authors: string[];
  translators?: string[]; // French-version translators, when distinct from authors
  url: string;
  license: string; // 'CC BY-SA 4.0'
  licenseUrl: string;
  retrievedAt: string; // YYYY-MM-DD
  publishedAt?: string; // YYYY-MM-DD, original publication date
  attributionPosition?: 'top' | 'bottom';
  revisionId?: string;
}

export interface AdaptationMeta {
  model: string;
  date: string; // YYYY-MM-DD
  changes: string;
  reviewer: string;
}

export interface LicenseMeta {
  name: 'CC BY-SA 4.0';
  url: string;
}

export interface ArticleImage {
  path: string;
  alt: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  changes: string;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  fileRevisionId: string;
  retrievedAt: string; // YYYY-MM-DD
}

export interface Article {
  id: string;
  title: string;
  level: CefrLevel;
  theme: string;
  date: string;
  summary: string;
  paragraphs: ArticleParagraph[];
  glossary: GlossaryEntry[];
  questions: Question[];
  image?: ArticleImage;
  translations: {
    zh: ArticleTranslation;
    [locale: string]: ArticleTranslation | undefined;
  };
  source: SourceMeta;
  adaptation: AdaptationMeta;
  license: LicenseMeta;
}

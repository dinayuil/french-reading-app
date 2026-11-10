import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LevelBadge from './LevelBadge';
import type { ArticleIndexEntry } from '../types/content';

interface ArticleCardProps {
  entry: ArticleIndexEntry;
}

export default function ArticleCard({ entry }: ArticleCardProps) {
  const { t } = useTranslation();

  return (
    <article className="article-card">
      <Link to={`/read/${entry.id}`} className="article-card__link">
        <header className="article-card__header">
          <LevelBadge level={entry.level} />
          <span className="article-card__theme">
            {t(`themes.${entry.theme}`, entry.theme)}
          </span>
        </header>
        <h2 className="article-card__title" lang="fr">
          {entry.title}
        </h2>
        <p className="article-card__summary" lang="fr">
          {entry.summary}
        </p>
        <footer className="article-card__footer">
          <time dateTime={entry.date}>{entry.date}</time>
        </footer>
      </Link>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LevelBadge from './LevelBadge';
import type { ArticleIndexEntry } from '../types/content';

interface ArticleCardProps {
  entry: ArticleIndexEntry;
  familyVersions?: ArticleIndexEntry[];
}

const LEVEL_ORDER = { A2: 0, B1: 1, B2: 2 } as const;

export default function ArticleCard({ entry, familyVersions }: ArticleCardProps) {
  const { t } = useTranslation();
  const versions = [
    ...(familyVersions ?? [entry, ...(entry.variants ?? [])]),
  ].sort(
    (left, right) => LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level],
  );
  const isMultiVersion = versions.length > 1;

  return (
    <article className="article-card">
      <Link to={`/read/${entry.id}`} className="article-card__link">
        <header className="article-card__header">
          {isMultiVersion ? (
            <span
              className="article-card__levels"
              role="group"
              aria-label={t('home.availableLevels')}
            >
              {versions.map((version) => (
                <LevelBadge
                  key={version.id}
                  level={version.level}
                  current={version.id === entry.id}
                />
              ))}
            </span>
          ) : (
            <LevelBadge level={entry.level} />
          )}
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

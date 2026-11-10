import type { Article } from '../types/content';

interface SourceAttributionProps {
  article: Article;
}

/**
 * Attribution that must appear before the adapted text (Global Voices).
 * The generic LicenseBlock still appears at the end with the modification
 * details and the adaptation license.
 */
export default function SourceAttribution({
  article,
}: SourceAttributionProps) {
  const publishedAt = article.source.publishedAt ?? article.source.retrievedAt;

  return (
    <div className="global-voices-attribution">
      <p>
        Cette histoire de {article.source.authors.join(', ')} est parue à
        l'origine sur {article.source.site} le {publishedAt} :{' '}
        <a
          href={article.source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.source.title}
        </a>
        . Adaptation simplifiée au niveau {article.level}, publiée sous{' '}
        <a
          href={article.license.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.license.name}
        </a>
        .
      </p>
    </div>
  );
}

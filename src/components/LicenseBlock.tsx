import { useTranslation } from 'react-i18next';
import type { Article } from '../types/content';

interface LicenseBlockProps {
  article: Article;
}

export default function LicenseBlock({ article }: LicenseBlockProps) {
  const { t } = useTranslation();
  const authors = article.source.authors.join(', ');

  return (
    <aside className="license-block" aria-label={t('licenseBlock.aria')}>
      <p>
        Texte adapté de «{' '}
        <a
          href={article.source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.source.title}
        </a>{' '}
        » de {authors}, {article.source.site}, publié sous{' '}
        <a
          href={article.source.licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.source.license}
        </a>
        .
      </p>
      <p>
        <strong>Modifications :</strong> {article.adaptation.changes} Révisé par{' '}
        {article.adaptation.reviewer}, {article.adaptation.date}.
      </p>
      <p>
        Cette adaptation est publiée sous{' '}
        <a
          href={article.license.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.license.name}
        </a>
        . Aucune approbation par l'auteur original.
      </p>
    </aside>
  );
}

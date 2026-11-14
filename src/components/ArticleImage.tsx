import { useState } from 'react';
import { resolveImageUrl } from '../lib/content';
import type { ArticleImage as ArticleImageMeta } from '../types/content';

interface ArticleImageProps {
  image: ArticleImageMeta;
}

export default function ArticleImage({ image }: ArticleImageProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null);

  let src: string;
  try {
    src = resolveImageUrl(image.path);
  } catch {
    return null;
  }

  if (failedPath === image.path) {
    return null;
  }

  return (
    <figure className="article-image" data-testid="article-image">
      <img
        className="article-image__img"
        src={src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        onError={() => setFailedPath(image.path)}
      />
      <figcaption
        className="article-image__credit"
        data-testid="article-image-credit"
        lang="fr"
      >
        <span
          className="article-image__caption"
          data-testid="article-image-caption"
        >
          Photo : {image.author} ·{' '}
          <a
            href={image.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Wikimedia Commons
          </a>{' '}
          ·{' '}
          <a
            href={image.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {image.license}
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

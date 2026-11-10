import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArticleCard from '../components/ArticleCard';
import ErrorState from '../components/ErrorState';
import OnboardingBanner from '../components/OnboardingBanner';
import { loadManifest, loadMonth } from '../lib/content';
import type { ArticleIndexEntry, CefrLevel } from '../types/content';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; entries: ArticleIndexEntry[] };

const LEVEL_FILTERS: Array<'all' | CefrLevel> = ['all', 'A2', 'B1', 'B2'];

export default function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [filter, setFilter] = useState<'all' | CefrLevel>('all');

  const load = async () => {
    setState({ status: 'loading' });

    try {
      const manifest = await loadManifest();
      const months = await Promise.all(
        manifest.months.map((month) => loadMonth(month)),
      );
      const entries = months
        .flatMap((month) => month.articles)
        .sort((a, b) => b.date.localeCompare(a.date));

      setState({ status: 'success', entries });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('errors.unexpected');
      setState({ status: 'error', message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredEntries = useMemo(() => {
    if (state.status !== 'success') return [];
    if (filter === 'all') return state.entries;
    return state.entries.filter((entry) => entry.level === filter);
  }, [state, filter]);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="container">
          <h1 className="hero__title">{t('home.heroTitle')}</h1>
          <p className="hero__subtitle">{t('home.heroSubtitle')}</p>
        </div>
      </section>

      <section className="container home-page__content">
        <OnboardingBanner />

        {state.status === 'loading' && (
          <p className="home-page__loading" role="status" aria-live="polite">
            {t('home.loading')}
          </p>
        )}

        {state.status === 'error' && (
          <ErrorState
            title={t('home.loadErrorTitle')}
            message={t('home.loadErrorMessage')}
            detail={state.message}
            onRetry={load}
          />
        )}

        {state.status === 'success' && (
          <>
            <div className="filter-bar">
              <div
                className="filter-bar__pills"
                role="group"
                aria-label={t('home.filterLabel')}
              >
                {LEVEL_FILTERS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`filter-bar__pill${filter === value ? ' filter-bar__pill--active' : ''}`}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {value === 'all' ? t('home.filterAll') : value}
                  </button>
                ))}
              </div>
              <p className="filter-bar__count" aria-live="polite">
                {t('home.count', { count: filteredEntries.length })}
              </p>
            </div>

            {filteredEntries.length === 0 ? (
              <p className="home-page__empty" role="status">
                {t('home.empty')}
              </p>
            ) : (
              <ul className="article-grid">
                {filteredEntries.map((entry) => (
                  <li key={entry.id}>
                    <ArticleCard entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

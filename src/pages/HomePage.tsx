import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArticleCard from '../components/ArticleCard';
import ErrorState from '../components/ErrorState';
import OnboardingBanner from '../components/OnboardingBanner';
import {
  addLocalDays,
  HOME_ORDER_OPTIONS,
  HOME_RANGE_OPTIONS,
  getLocalToday,
  type HomeOrder,
  type HomeRangeDays,
} from '../features/home/homeDates';
import {
  useHomeFeed,
  type LevelFilter,
} from '../features/home/useHomeFeed';

const LEVEL_FILTERS: LevelFilter[] = ['all', 'A2', 'B1', 'B2'];

const RANGE_LABEL_KEYS: Record<HomeRangeDays, string> = {
  3: 'home.range3',
  7: 'home.range7',
  30: 'home.range30',
};

const ORDER_LABEL_KEYS: Record<HomeOrder, string> = {
  newest: 'home.orderNewest',
  oldest: 'home.orderOldest',
};

interface HomePageProps {
  /** Injectable clock key (YYYY-MM-DD) for tests and deterministic previews. */
  today?: string;
}

export default function HomePage({
  today = getLocalToday(),
}: HomePageProps = {}) {
  const { t, i18n } = useTranslation();
  const [rangeDays, setRangeDays] = useState<HomeRangeDays>(3);
  const [level, setLevel] = useState<LevelFilter>('all');
  const [order, setOrder] = useState<HomeOrder>('newest');
  const feed = useHomeFeed({ rangeDays, level, order, today });
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(feed.loadMore);

  useEffect(() => {
    loadMoreRef.current = feed.loadMore;
  });

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !feed.hasMore || feed.loading || feed.dayError) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRef.current();
        }
      },
      { rootMargin: '0px 0px 160px 0px' },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [
    feed.hasMore,
    feed.loading,
    feed.dayError,
    feed.entryCount,
    feed.loadedDayCount,
  ]);

  const formatDayHeading = (dateKey: string): string => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'fr-FR';
    const formatted = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);

    if (dateKey === today) {
      return `${t('home.today')} · ${formatted}`;
    }
    if (dateKey === addLocalDays(today, -1)) {
      return `${t('home.yesterday')} · ${formatted}`;
    }
    return formatted;
  };

  const showFooter =
    !feed.dayError &&
    !feed.isEmpty &&
    (feed.entryCount > 0 || !feed.loading);

  return (
    <div className="home-page">
      <section className="hero home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <p className="home-hero__kicker">{t('home.heroKicker')}</p>
            <h1 className="hero__title">{t('home.heroTitle')}</h1>
          </div>
        </div>
      </section>

      <section className="container home-page__content">
        <OnboardingBanner />

        {feed.status === 'loading' && (
          <p className="home-page__loading" role="status" aria-live="polite">
            {t('home.loading')}
          </p>
        )}

        {feed.status === 'error' && (
          <ErrorState
            title={t('home.loadErrorTitle')}
            message={t('home.loadErrorMessage')}
            detail={feed.manifestError ?? undefined}
            onRetry={feed.retry}
          />
        )}

        {feed.status === 'ready' && (
          <>
            <div
              className="home-toolbar"
              role="group"
              aria-label={t('home.filtersLabel')}
            >
              <div className="home-toolbar__group">
                <span className="home-toolbar__label">
                  {t('home.levelLabel')}
                </span>
                <div
                  className="filter-bar__pills"
                  role="group"
                  aria-label={t('home.filterLabel')}
                >
                  {LEVEL_FILTERS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`filter-bar__pill${level === value ? ' filter-bar__pill--active' : ''}`}
                      aria-pressed={level === value}
                      onClick={() => setLevel(value)}
                    >
                      {value === 'all' ? t('home.filterAll') : value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="home-toolbar__group">
                <span
                  className="home-toolbar__label"
                  id="home-range-label"
                >
                  {t('home.rangeLabel')}
                </span>
                <div
                  className="segmented"
                  role="group"
                  aria-labelledby="home-range-label"
                >
                  {HOME_RANGE_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="segmented__button"
                      aria-pressed={rangeDays === value}
                      onClick={() => setRangeDays(value)}
                    >
                      {t(RANGE_LABEL_KEYS[value])}
                    </button>
                  ))}
                </div>
              </div>

              <div className="home-toolbar__group">
                <span
                  className="home-toolbar__label"
                  id="home-order-label"
                >
                  {t('home.orderLabel')}
                </span>
                <div
                  className="segmented"
                  role="group"
                  aria-labelledby="home-order-label"
                >
                  {HOME_ORDER_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="segmented__button"
                      aria-pressed={order === value}
                      onClick={() => setOrder(value)}
                    >
                      {t(ORDER_LABEL_KEYS[value])}
                    </button>
                  ))}
                </div>
              </div>

              {feed.entryCount > 0 && (
                <p className="home-toolbar__count" aria-live="polite">
                  {t('home.loadedCount', { count: feed.entryCount })}
                </p>
              )}
            </div>

            {feed.loading && feed.entryCount === 0 && !feed.dayError && (
              <>
                <p className="sr-only" role="status" aria-live="polite">
                  {t('home.loading')}
                </p>
                <div className="home-skeleton" aria-hidden="true">
                  <div className="home-skeleton__card" />
                  <div className="home-skeleton__card" />
                  <div className="home-skeleton__card" />
                  <div className="home-skeleton__card" />
                  <div className="home-skeleton__card" />
                  <div className="home-skeleton__card" />
                </div>
              </>
            )}

            {feed.isEmpty && (
              <p className="home-page__empty" role="status">
                {t('home.empty')}
              </p>
            )}

            {feed.groups.length > 0 && (
              <section
                className="home-feed__days"
                aria-label={t('home.listLabel')}
              >
                {feed.groups.map((group) => (
                  <section
                    key={group.date}
                    className="article-day"
                    aria-labelledby={`home-day-${group.date}`}
                  >
                    <div className="article-day__header">
                      <h2
                        id={`home-day-${group.date}`}
                        className="article-day__title"
                      >
                        {formatDayHeading(group.date)}
                      </h2>
                      <span
                        className="article-day__line"
                        aria-hidden="true"
                      />
                    </div>
                    <ul className="article-grid">
                      {group.entries.map((entry) => (
                        <li key={entry.id}>
                          <ArticleCard entry={entry} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            )}

            {feed.dayError && (
              <div className="home-feed__error" role="alert">
                <h2 className="home-feed__error-title">
                  {t('home.dayLoadErrorTitle')}
                </h2>
                <p className="home-feed__error-text">
                  {t('home.dayLoadErrorMessage')}
                </p>
                <details className="home-feed__detail">
                  <summary>{t('common.errorDetail')}</summary>
                  <code>{feed.dayError.message}</code>
                </details>
                <button
                  type="button"
                  className="home-feed__retry"
                  onClick={feed.retry}
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {showFooter && (
              <div className="home-feed">
                {feed.loading && feed.entryCount > 0 && (
                  <p className="home-feed__status" role="status">
                    {t('home.loadingMore')}
                  </p>
                )}

                {!feed.dayError && feed.hasMore && (
                  <button
                    type="button"
                    className="home-feed__button"
                    onClick={feed.loadMore}
                    disabled={feed.loading}
                    aria-busy={feed.loading || undefined}
                  >
                    {t('home.loadMore')}
                  </button>
                )}

                {feed.exhausted &&
                  !feed.hasMore &&
                  feed.entryCount > 0 && (
                    <p className="home-feed__end">{t('home.allLoaded')}</p>
                  )}

                {feed.hasMore && (
                  <div
                    ref={sentinelRef}
                    className="home-feed__sentinel"
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

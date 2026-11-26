import { Capacitor } from '@capacitor/core';
import { Link, Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageMenu from './LanguageMenu';
import LanguageSwitch from './LanguageSwitch';
import MobileTabBar from './MobileTabBar';
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import type { ReleaseUpdates } from '../features/updates/useReleaseUpdates';

interface LayoutProps {
  releaseUpdates?: ReleaseUpdates | null;
}

export default function Layout({ releaseUpdates }: LayoutProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isImmersive =
    pathname.startsWith('/read/') || pathname.startsWith('/practice/');
  const showTabBar = isMobile && !isImmersive;
  const releaseNotice =
    pathname === '/' && releaseUpdates?.showNotice
      ? releaseUpdates.release
      : null;

  return (
    <div
      className={`layout${isMobile ? ' layout--mobile' : ''}`}
      data-platform={Capacitor.getPlatform()}
    >
      {isMobile ? (
        <header className="mobile-top-bar">
          <div className="container mobile-top-bar__inner">
            <Link to="/" className="wordmark">
              Lire en français
            </Link>
            <LanguageMenu />
          </div>
        </header>
      ) : (
        <header className="top-bar">
          <div className="container top-bar__inner">
            <Link to="/" className="wordmark">
              Lire en français
            </Link>
            <div className="top-bar__actions">
              <nav className="top-bar__nav" aria-label={t('nav.label')}>
                <NavLink to="/" className="top-bar__link" end>
                  {t('nav.read')}
                </NavLink>
                <NavLink to="/stats" className="top-bar__link">
                  {t('nav.stats')}
                </NavLink>
                <NavLink to="/mots" className="top-bar__link">
                  {t('nav.vocabulary')}
                </NavLink>
                <NavLink to="/settings" className="top-bar__link">
                  {t('nav.settings')}
                </NavLink>
              </nav>
              <LanguageSwitch />
            </div>
          </div>
        </header>
      )}

      {releaseNotice && (
        <aside
          className="release-notice"
          aria-label={t('updates.noticeLabel')}
        >
          <div className="container release-notice__inner">
            <p className="release-notice__text" role="status">
              {t('updates.available', {
                version: releaseNotice.version,
              })}
            </p>
            <div className="release-notice__actions">
              <a
                className="release-notice__link"
                href={releaseNotice.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('updates.availableLink', {
                  version: releaseNotice.version,
                })}
              </a>
              <button
                type="button"
                className="release-notice__dismiss"
                onClick={releaseUpdates?.dismiss}
              >
                {t('updates.dismiss')}
              </button>
            </div>
          </div>
        </aside>
      )}

      <main
        className={`layout__main${showTabBar ? ' layout__main--tabbar' : ''}`}
      >
        <Outlet />
      </main>

      {!isMobile && (
        <footer className="site-footer">
          <div className="container site-footer__inner">
            <p>© {new Date().getFullYear()} Lire en français</p>
          </div>
        </footer>
      )}

      {showTabBar && <MobileTabBar />}
    </div>
  );
}

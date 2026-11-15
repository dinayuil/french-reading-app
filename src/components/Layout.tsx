import { Link, Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageMenu from './LanguageMenu';
import LanguageSwitch from './LanguageSwitch';
import MobileTabBar from './MobileTabBar';
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

export default function Layout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isImmersive =
    pathname.startsWith('/read/') || pathname.startsWith('/practice/');
  const showTabBar = isMobile && !isImmersive;

  return (
    <div className={`layout${isMobile ? ' layout--mobile' : ''}`}>
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
                <NavLink to="/data" className="top-bar__link">
                  {t('nav.data')}
                </NavLink>
                <NavLink to="/mots" className="top-bar__link">
                  {t('nav.vocabulary')}
                </NavLink>
                <NavLink to="/aide" className="top-bar__link">
                  {t('nav.help')}
                </NavLink>
              </nav>
              <LanguageSwitch />
            </div>
          </div>
        </header>
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
            <Link to="/licences" className="site-footer__link">
              {t('nav.licenses')}
            </Link>
          </div>
        </footer>
      )}

      {showTabBar && <MobileTabBar />}
    </div>
  );
}

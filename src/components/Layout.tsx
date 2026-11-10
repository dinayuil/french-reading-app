import { Link, Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitch from './LanguageSwitch';

export default function Layout() {
  const { t } = useTranslation();

  return (
    <div className="layout">
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
              <NavLink to="/aide" className="top-bar__link">
                {t('nav.help')}
              </NavLink>
              <NavLink to="/licences" className="top-bar__link">
                {t('nav.licenses')}
              </NavLink>
            </nav>
            <LanguageSwitch />
          </div>
        </div>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <p>© {new Date().getFullYear()} Lire en français</p>
        </div>
      </footer>
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TABS = [
  {
    to: '/',
    labelKey: 'nav.read',
    end: true,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 5.7C8.6 4.6 6.5 4.2 4 4.2v11.2c2.5 0 4.6.4 6 1.5 1.4-1.1 3.5-1.5 6-1.5V4.2c-2.5 0-4.6.4-6 1.5Z" />
        <path d="M10 5.7v11.2" />
      </svg>
    ),
  },
  {
    to: '/data',
    labelKey: 'nav.data',
    end: false,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M4 16.5V11M10 16.5V5.5M16 16.5v-3.5" />
      </svg>
    ),
  },
  {
    to: '/mots',
    labelKey: 'nav.vocabulary',
    end: false,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 3.2h10a1 1 0 0 1 1 1v12.6l-6-3.2-6 3.2V4.2a1 1 0 0 1 1-1Z" />
        <path d="M7.4 7h5.2" />
      </svg>
    ),
  },
  {
    to: '/aide',
    labelKey: 'nav.help',
    end: false,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="7.4" />
        <path
          d="M8 7.7a2.1 2.1 0 1 1 3.2 1.8c-.8.5-1.2 1-1.2 1.9"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.2" r=".9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
] as const;

export default function MobileTabBar() {
  const { t } = useTranslation();

  return (
    <nav className="tab-bar" aria-label={t('nav.label')}>
      {TABS.map(({ to, labelKey, end, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `tab-bar__link${isActive ? ' tab-bar__link--active' : ''}`
          }
        >
          <span className="tab-bar__icon">{icon}</span>
          <span className="tab-bar__label">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

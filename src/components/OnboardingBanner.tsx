import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadSettings, saveSettings } from '../lib/settings';

export default function OnboardingBanner() {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(() => loadSettings().onboardingSeen);

  if (seen) return null;

  const markSeen = () => {
    saveSettings({ onboardingSeen: true });
    setSeen(true);
  };

  return (
    <aside
      className="onboarding"
      role="region"
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding__body">
        <h2 id="onboarding-title" className="onboarding__title">
          {t('onboarding.title')}
        </h2>
        <p className="onboarding__text">{t('onboarding.body')}</p>
      </div>
      <div className="onboarding__actions">
        <Link to="/aide" className="onboarding__link" onClick={markSeen}>
          {t('onboarding.openHelp')}
        </Link>
        <button
          type="button"
          className="onboarding__dismiss"
          onClick={markSeen}
        >
          {t('onboarding.dismiss')}
        </button>
      </div>
    </aside>
  );
}

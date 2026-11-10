import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const SECTIONS = ['read', 'practice', 'language', 'data', 'license'] as const;

export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="container page page--centred help-page">
      <h1 className="page__title">{t('help.title')}</h1>
      <p className="page__body help-page__intro">{t('help.intro')}</p>

      {SECTIONS.map((section) => (
        <section key={section} className="help-page__section">
          <h2 className="help-page__heading">{t(`help.${section}.title`)}</h2>
          <p className="page__body">
            {t(`help.${section}.body`)}
            {section === 'license' && (
              <>
                {' '}
                <Link to="/licences">{t('help.license.link')}</Link>
              </>
            )}
          </p>
        </section>
      ))}

      <p className="help-page__back">
        <Link to="/">{t('help.backToRead')}</Link>
      </p>
    </div>
  );
}

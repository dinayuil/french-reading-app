import { useTranslation } from 'react-i18next';

const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const LEGAL_CODE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/legalcode';

const SOURCES = [
  {
    name: 'Wikipédia FR',
    url: 'https://fr.wikipedia.org/',
    license: 'CC BY-SA 4.0',
  },
  {
    name: 'Vikidia',
    url: 'https://fr.vikidia.org/',
    license: 'CC BY-SA 3.0',
  },
  {
    name: 'Global Voices FR',
    url: 'https://fr.globalvoices.org/',
    license: 'CC BY 3.0',
  },
  {
    name: 'Wikisource FR',
    url: 'https://fr.wikisource.org/',
    license: 'PD / CC BY-SA',
  },
  {
    name: 'UNESCO Courier',
    url: 'https://courier.unesco.org/',
    license: 'CC BY-SA 3.0 IGO',
  },
];

export default function LicensesPage() {
  const { t } = useTranslation();

  return (
    <div className="container page page--centred licenses-page">
      <h1 className="page__title">{t('licenses.title')}</h1>

      <p className="page__body">{t('licenses.intro')}</p>
      <p className="page__body">
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
          {t('licenses.licenseLink')}
        </a>
        {' · '}
        <a href={LEGAL_CODE_URL} target="_blank" rel="noopener noreferrer">
          {t('licenses.legalCode')}
        </a>
      </p>

      <section className="licenses-page__section">
        <h2 className="licenses-page__heading">{t('licenses.sourcesTitle')}</h2>
        <p className="page__body">{t('licenses.sourcesIntro')}</p>
        <ul
          className="licenses-page__sources"
          aria-label={t('licenses.sourcesTitle')}
        >
          {SOURCES.map((source) => (
            <li key={source.name}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.name}
              </a>
              <span className="licenses-page__source-license">
                {t('licenses.sourceLicense', { license: source.license })}
              </span>
            </li>
          ))}
        </ul>
        <p className="page__body">{t('licenses.unescoNote')}</p>
        <p className="page__body">{t('licenses.sourcesNote')}</p>
      </section>

      <section className="licenses-page__section">
        <h2 className="licenses-page__heading">{t('licenses.codeTitle')}</h2>
        <p className="page__body">{t('licenses.codeBody')}</p>
      </section>

      <section className="licenses-page__section">
        <h2 className="licenses-page__heading">{t('licenses.contactTitle')}</h2>
        <p className="page__body">{t('licenses.contactBody')}</p>
      </section>
    </div>
  );
}

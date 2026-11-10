import { useTranslation } from 'react-i18next';
import type { UiLanguage } from '../types/progress';

const LANGUAGES: ReadonlyArray<{
  code: UiLanguage;
  labelKey: string;
  lang: string;
}> = [
  { code: 'fr', labelKey: 'language.fr', lang: 'fr' },
  { code: 'zh', labelKey: 'language.zh', lang: 'zh-CN' },
];

export default function LanguageSwitch() {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t('language.label')}
    >
      {LANGUAGES.map(({ code, labelKey, lang }) => (
        <button
          key={code}
          type="button"
          lang={lang}
          className="language-switch__button"
          aria-pressed={i18n.language === code}
          onClick={() => {
            void i18n.changeLanguage(code);
          }}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

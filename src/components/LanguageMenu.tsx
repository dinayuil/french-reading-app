import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { UiLanguage } from '../types/progress';

const LANGUAGES: ReadonlyArray<{
  code: UiLanguage;
  label: string;
  lang: string;
}> = [
  { code: 'fr', label: 'Français', lang: 'fr' },
  { code: 'zh', label: '中文', lang: 'zh-CN' },
];

export default function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = i18n.language === 'zh' ? 1 : 0;

  const closeMenu = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const focusItem = (index: number): void => {
    const count = LANGUAGES.length;
    const next = (index + count) % count;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(LANGUAGES.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        closeMenu(true);
        break;
      default:
        break;
    }
  };

  const openMenu = (): void => {
    setActiveIndex(selectedIndex);
    setOpen((current) => !current);
  };

  return (
    <div className="language-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="language-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('language.menuLabel', {
          language:
            i18n.language === 'zh'
              ? t('language.zhName')
              : t('language.frName'),
        })}
        onClick={openMenu}
      >
        <svg
          className="language-menu__globe"
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="8" cy="8" r="6.2" />
          <path d="M1.8 8h12.4M8 1.8c1.7 1.8 2.6 3.9 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.3 5.4 8S6.3 3.6 8 1.8Z" />
        </svg>
        <span
          className={`language-menu__code${selectedIndex === 0 ? ' language-menu__code--current' : ''}`}
          lang="fr"
          aria-hidden="true"
        >
          FR
        </span>
        <span className="language-menu__separator" aria-hidden="true">
          ·
        </span>
        <span
          className={`language-menu__code${selectedIndex === 1 ? ' language-menu__code--current' : ''}`}
          lang="zh-CN"
          aria-hidden="true"
        >
          中
        </span>
        <svg
          className={`language-menu__chevron${open ? ' language-menu__chevron--open' : ''}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m2.5 4 2.5 2.5L7.5 4" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          className="language-menu__popup"
          role="menu"
          aria-label={t('language.label')}
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
        >
          {LANGUAGES.map(({ code, label, lang }, index) => {
            const checked = i18n.language === code;
            return (
              <button
                key={code}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={activeIndex === index ? 0 : -1}
                lang={lang}
                className={`language-menu__item${checked ? ' language-menu__item--checked' : ''}`}
                onClick={() => {
                  if (!checked) {
                    void i18n.changeLanguage(code);
                  }
                  closeMenu(true);
                }}
              >
                <span>{label}</span>
                {checked && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m3 8.5 3.2 3L13 4.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

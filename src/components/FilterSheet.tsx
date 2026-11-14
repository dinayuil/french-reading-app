import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  HOME_ORDER_OPTIONS,
  HOME_RANGE_OPTIONS,
  type HomeOrder,
  type HomeRangeDays,
} from '../features/home/homeDates';
import {
  ORDER_LABEL_KEYS,
  RANGE_LABEL_KEYS,
} from '../features/home/filterLabels';

interface FilterSheetProps {
  rangeDays: HomeRangeDays;
  order: HomeOrder;
  onRangeChange: (rangeDays: HomeRangeDays) => void;
  onOrderChange: (order: HomeOrder) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function FilterSheet({
  rangeDays,
  order,
  onRangeChange,
  onOrderChange,
  onClose,
  returnFocusRef,
}: FilterSheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const closeSheet = (): void => {
    onClose();
    returnFocusRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="filter-sheet-backdrop"
      data-testid="filter-sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSheet();
      }}
    >
      <div
        ref={panelRef}
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <span className="filter-sheet__handle" aria-hidden="true" />

        <div className="filter-sheet__header">
          <h2 id={titleId} className="filter-sheet__title">
            {t('home.filtersTitle')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="filter-sheet__close"
            aria-label={t('home.filtersClose')}
            onClick={closeSheet}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>

        <div className="filter-sheet__section">
          <h3 className="filter-sheet__label">{t('home.rangeLabel')}</h3>
          <div
            className="filter-sheet__options"
            role="group"
            aria-label={t('home.rangeLabel')}
          >
            {HOME_RANGE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className="filter-sheet__option"
                aria-pressed={rangeDays === value}
                onClick={() => onRangeChange(value)}
              >
                {t(RANGE_LABEL_KEYS[value])}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet__section">
          <h3 className="filter-sheet__label">{t('home.orderLabel')}</h3>
          <div
            className="filter-sheet__options"
            role="group"
            aria-label={t('home.orderLabel')}
          >
            {HOME_ORDER_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className="filter-sheet__option"
                aria-pressed={order === value}
                onClick={() => onOrderChange(value)}
              >
                {t(ORDER_LABEL_KEYS[value])}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="filter-sheet__submit"
          onClick={closeSheet}
        >
          {t('home.showArticles')}
        </button>
      </div>
    </div>
  );
}

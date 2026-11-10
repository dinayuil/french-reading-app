import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}

export default function ErrorState({
  title,
  message,
  detail,
  onRetry,
  retryLabel,
  children,
}: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="error-state" role="alert" aria-live="assertive">
      <div className="error-state__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      </div>
      <h2 className="error-state__title">{title}</h2>
      <p className="error-state__message">{message}</p>
      {detail && (
        <details className="error-state__detail">
          <summary className="error-state__summary">
            {t('common.errorDetail')}
          </summary>
          <code className="error-state__detail-text">{detail}</code>
        </details>
      )}
      {children}
      {onRetry && (
        <button
          type="button"
          className="error-state__retry"
          onClick={onRetry}
        >
          {retryLabel ?? t('common.retry')}
        </button>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';

export type NoticeTone = 'success' | 'error' | 'info';

export interface Notice {
  tone: NoticeTone;
  key: string;
  values?: Record<string, string>;
}

export default function NoticeMessage({ notice }: { notice: Notice | null }) {
  const { t } = useTranslation();

  if (!notice) return null;

  const text = notice.values
    ? t(notice.key, notice.values)
    : t(notice.key);

  return (
    <p
      className={`data-notice data-notice--${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  );
}

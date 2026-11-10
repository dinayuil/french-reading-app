import type { GlossaryEntry } from '../types/content';

interface GlossaryTextProps {
  text: string;
  glossary: GlossaryEntry[];
  onLookup: (term: string) => void;
  enabled?: boolean;
  ariaLabelForTerm?: (term: string) => string;
}

function buildGlossaryRegex(terms: string[]): RegExp | null {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;

  const escaped = sorted.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return new RegExp(`(${escaped.join('|')})`, 'g');
}

export default function GlossaryText({
  text,
  glossary,
  onLookup,
  enabled = true,
  ariaLabelForTerm,
}: GlossaryTextProps) {
  if (!enabled || glossary.length === 0) {
    return <>{text}</>;
  }

  const terms = glossary.map((entry) => entry.term);
  const regex = buildGlossaryRegex(terms);
  if (!regex) return <>{text}</>;

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        const entry = glossary.find((g) => g.term === part);
        if (entry) {
          return (
            <button
              key={`${part}-${index}`}
              type="button"
              className="gloss-term"
              onClick={() => onLookup(entry.term)}
              aria-label={
                ariaLabelForTerm ? ariaLabelForTerm(entry.term) : entry.term
              }
            >
              {part}
            </button>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

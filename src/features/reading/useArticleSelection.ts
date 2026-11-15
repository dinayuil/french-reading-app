import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface ArticleSelection {
  text: string;
  context?: string;
}

const CONTROL_SELECTOR =
  '.selection-toolbar, .explanation-panel, .selection-panel, .marked-terms';

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function elementFor(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function contextFor(range: Range, container: HTMLElement): string | undefined {
  const start = elementFor(range.startContainer);
  const end = elementFor(range.endContainer);
  const sentence = start?.closest('.sentence-fr, .sentence-zh, p');
  const endSentence = end?.closest('.sentence-fr, .sentence-zh, p');

  if (sentence && sentence === endSentence && container.contains(sentence)) {
    const text = normalizedText(sentence.textContent);
    if (text) return text.slice(0, 280);
  }

  const paragraph = start?.closest('p');
  if (paragraph && container.contains(paragraph)) {
    const text = normalizedText(paragraph.textContent);
    if (text) return text.slice(0, 280);
  }

  return undefined;
}

/**
 * Tracks a selection only while both ends are inside the article body. It
 * ignores presses inside the lookup panel or selection toolbar, and waits for
 * the long-press handles to settle on touch devices. Reading is never moved:
 * the hook only stores text and its source sentence.
 */
export function useArticleSelection(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
): {
  selection: ArticleSelection | null;
  clearSelection: () => void;
} {
  const [selection, setSelection] = useState<ArticleSelection | null>(null);
  const timerRef = useRef<number | null>(null);
  const selectionRef = useRef<ArticleSelection | null>(null);
  selectionRef.current = selection;

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const readSelection = useCallback(() => {
    const container = containerRef.current;
    const browserSelection = window.getSelection();

    if (
      !container ||
      !browserSelection ||
      browserSelection.rangeCount === 0 ||
      browserSelection.isCollapsed
    ) {
      if (selectionRef.current) setSelection(null);
      return;
    }

    const text = normalizedText(browserSelection.toString());
    const inside = (node: Node | null) => {
      const element = elementFor(node);
      return element !== null && container.contains(element);
    };
    const inChineseLayer = (node: Node | null) => {
      const element = elementFor(node);
      return element !== null && element.closest('.sentence-zh') !== null;
    };

    if (
      !text ||
      !inside(browserSelection.anchorNode) ||
      !inside(browserSelection.focusNode) ||
      inChineseLayer(browserSelection.anchorNode) ||
      inChineseLayer(browserSelection.focusNode)
    ) {
      if (selectionRef.current) setSelection(null);
      return;
    }

    let context: string | undefined;
    try {
      context = contextFor(browserSelection.getRangeAt(0), container);
    } catch {
      context = undefined;
    }

    const next = { text: text.slice(0, 160), context };
    if (
      selectionRef.current?.text !== next.text ||
      selectionRef.current?.context !== next.context
    ) {
      setSelection(next);
    }
  }, [containerRef]);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }

    const isControl = (target: EventTarget | null) =>
      target instanceof Element && target.closest(CONTROL_SELECTOR) !== null;

    const handleMouseUp = (event: MouseEvent) => {
      if (isControl(event.target)) return;
      cancelTimer();
      readSelection();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (isControl(event.target)) return;
      cancelTimer();
      // Android needs a moment after the selection handles settle.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        readSelection();
      }, 180);
    };

    const scheduleSelectionRead = () => {
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        readSelection();
      }, 160);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('selectionchange', scheduleSelectionRead);

    return () => {
      cancelTimer();
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('selectionchange', scheduleSelectionRead);
    };
  }, [enabled, readSelection, cancelTimer]);

  const clearSelection = useCallback(() => {
    cancelTimer();
    setSelection(null);
  }, [cancelTimer]);

  return { selection, clearSelection };
}

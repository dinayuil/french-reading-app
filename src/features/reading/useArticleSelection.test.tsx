import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useArticleSelection } from './useArticleSelection';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const { selection, clearSelection, selectRange } = useArticleSelection(ref);

  const selectParis = () => {
    const node = document.querySelector('.sentence-fr')?.firstChild;
    if (!(node instanceof Text)) return;
    const start = node.data.indexOf('Paris');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 'Paris'.length);
    selectRange(range, 'Paris');
  };

  return (
    <div>
      <div ref={ref} data-testid="article">
        <span className="sentence-fr">La tour Eiffel est à Paris.</span>
        <span className="sentence-zh">埃菲尔铁塔在巴黎。</span>
      </div>
      <p data-testid="outside">Texte hors article</p>
      <p data-testid="selected">{selection?.text ?? ''}</p>
      <p data-testid="context">{selection?.context ?? ''}</p>
      <button type="button" onClick={selectParis}>
        select range
      </button>
      <button type="button" onClick={clearSelection}>
        clear
      </button>
    </div>
  );
}

function stubSelection(text: string, selector: string) {
  let selectedText = text;
  const node = () => document.querySelector(selector);
  const selection = {
    toString: () => selectedText,
    get isCollapsed() {
      return selectedText.length === 0;
    },
    get anchorNode() {
      return selectedText ? node() : null;
    },
    get focusNode() {
      return selectedText ? node() : null;
    },
    get rangeCount() {
      return selectedText ? 1 : 0;
    },
    getRangeAt: () => ({
      startContainer: node(),
      endContainer: node(),
    }),
    removeAllRanges: () => {
      selectedText = '';
    },
    addRange: (range: Range) => {
      selectedText = range.toString();
    },
  };
  vi.stubGlobal('getSelection', vi.fn(() => selection));
}

describe('useArticleSelection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps a French selection inside the article with its sentence context', () => {
    render(<Harness />);
    stubSelection('Paris', '.sentence-fr');

    fireEvent.mouseUp(screen.getByTestId('article'));

    expect(screen.getByTestId('selected')).toHaveTextContent('Paris');
    expect(screen.getByTestId('context')).toHaveTextContent(
      'La tour Eiffel est à Paris.',
    );
  });

  it('ignores a selection that starts outside the article', () => {
    render(<Harness />);
    stubSelection('Texte', '[data-testid="outside"]');

    fireEvent.mouseUp(screen.getByTestId('outside'));

    expect(screen.getByTestId('selected')).toBeEmptyDOMElement();
  });

  it('ignores the Chinese translation layer', () => {
    render(<Harness />);
    stubSelection('巴黎', '.sentence-zh');

    fireEvent.mouseUp(screen.getByTestId('article'));

    expect(screen.getByTestId('selected')).toBeEmptyDOMElement();
  });

  it('waits for touch selection handles to settle', () => {
    vi.useFakeTimers();
    render(<Harness />);
    stubSelection('Paris', '.sentence-fr');

    fireEvent.touchEnd(screen.getByTestId('article'));
    expect(screen.getByTestId('selected')).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('selected')).toHaveTextContent('Paris');
  });

  it('clears the selection when asked', () => {
    render(<Harness />);
    stubSelection('Paris', '.sentence-fr');
    fireEvent.mouseUp(screen.getByTestId('article'));
    expect(screen.getByTestId('selected')).toHaveTextContent('Paris');

    fireEvent.click(screen.getByRole('button', { name: 'clear' }));

    expect(screen.getByTestId('selected')).toBeEmptyDOMElement();
  });

  it('applies a programmatic range immediately and moves the browser selection', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'select range' }));

    expect(screen.getByTestId('selected')).toHaveTextContent('Paris');
    expect(screen.getByTestId('context')).toHaveTextContent(
      'La tour Eiffel est à Paris.',
    );
    expect(window.getSelection()?.toString()).toBe('Paris');
  });

  it('keeps a programmatic selection after a pending touch timer settles', () => {
    vi.useFakeTimers();
    render(<Harness />);
    stubSelection('Paris', '.sentence-fr');

    fireEvent.touchEnd(screen.getByTestId('article'));
    fireEvent.click(screen.getByRole('button', { name: 'select range' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('selected')).toHaveTextContent('Paris');
  });
});

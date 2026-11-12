import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativeApp: vi.fn(),
  addListener: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock('./runtime', () => ({
  isNativeApp: mocks.isNativeApp,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: mocks.addListener,
    exitApp: mocks.exitApp,
  },
}));

import { initializeNativeApp } from './lifecycle';

describe('initializeNativeApp', () => {
  beforeEach(() => {
    mocks.isNativeApp.mockReset();
    mocks.addListener.mockReset();
    mocks.exitApp.mockReset();
    mocks.exitApp.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing in the browser', async () => {
    mocks.isNativeApp.mockReturnValue(false);

    const cleanup = await initializeNativeApp();

    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('navigates back when possible and exits at the root', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    const remove = vi.fn().mockResolvedValue(undefined);
    mocks.addListener.mockResolvedValue({ remove });
    const back = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => undefined);

    const cleanup = await initializeNativeApp();

    expect(mocks.addListener).toHaveBeenCalledWith(
      'backButton',
      expect.any(Function),
    );
    const handler = mocks.addListener.mock.calls[0][1] as (event: {
      canGoBack: boolean;
    }) => void;

    handler({ canGoBack: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.exitApp).not.toHaveBeenCalled();

    handler({ canGoBack: false });
    expect(mocks.exitApp).toHaveBeenCalledTimes(1);

    await cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

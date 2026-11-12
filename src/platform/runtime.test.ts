import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isNativePlatform } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}));

import { isNativeApp } from './runtime';

describe('isNativeApp', () => {
  beforeEach(() => {
    isNativePlatform.mockReset();
  });

  it('returns true when Capacitor reports a native platform', () => {
    isNativePlatform.mockReturnValue(true);

    expect(isNativeApp()).toBe(true);
    expect(isNativePlatform).toHaveBeenCalledTimes(1);
  });

  it('returns false in the browser', () => {
    isNativePlatform.mockReturnValue(false);

    expect(isNativeApp()).toBe(false);
  });
});

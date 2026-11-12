import { beforeEach, describe, expect, it } from 'vitest';
import {
  WEBDAV_SETTINGS_STORAGE_KEY,
  loadWebDavSettings,
  saveWebDavSettings,
} from './webdav';

describe('WebDAV settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty settings when nothing has been saved', () => {
    expect(loadWebDavSettings()).toEqual({ url: '', username: '' });
  });

  it('returns empty settings for corrupt or malformed stored values', () => {
    localStorage.setItem(WEBDAV_SETTINGS_STORAGE_KEY, 'not json');
    expect(loadWebDavSettings()).toEqual({ url: '', username: '' });

    localStorage.setItem(
      WEBDAV_SETTINGS_STORAGE_KEY,
      JSON.stringify({ url: 42, username: null }),
    );
    expect(loadWebDavSettings()).toEqual({ url: '', username: '' });
  });

  it('saves only the URL and username whitelist', () => {
    const settings = {
      url: 'https://dav.example.com/books/',
      username: 'reader',
      password: 'must-not-be-saved',
      token: 'must-not-be-saved-either',
    };

    saveWebDavSettings(settings);

    const raw = localStorage.getItem(WEBDAV_SETTINGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('must-not-be-saved');
    expect(JSON.parse(raw as string)).toEqual({
      url: 'https://dav.example.com/books/',
      username: 'reader',
    });
    expect(Object.keys(JSON.parse(raw as string))).toEqual(['url', 'username']);
  });

  it('round-trips saved settings and ignores any stored password', () => {
    saveWebDavSettings({
      url: 'https://dav.example.com/books/',
      username: 'reader',
    });

    localStorage.setItem(
      WEBDAV_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        url: 'https://dav.example.com/books/',
        username: 'reader',
        password: 'legacy-password',
        extra: 'ignored',
      }),
    );

    const loaded = loadWebDavSettings();
    expect(loaded).toEqual({
      url: 'https://dav.example.com/books/',
      username: 'reader',
    });
    expect(Object.keys(loaded)).toEqual(['url', 'username']);
  });
});

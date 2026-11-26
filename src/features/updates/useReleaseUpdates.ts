import { useEffect, useState } from 'react';
import { version as currentVersion } from '../../../package.json';
import { isNativeApp } from '../../platform/runtime';
import { findReleaseUpdate, type InstalledPlatform, type ReleaseUpdate } from './releases';

type CheckResult =
  | { status: 'checking' | 'current' | 'error'; release: null }
  | { status: 'available'; release: ReleaseUpdate };

export type ReleaseUpdates = CheckResult & {
  currentVersion: string;
  showNotice: boolean;
  check: () => void;
  dismiss: () => void;
};

function getInstalledPlatform(): InstalledPlatform | null {
  if (window.frenchReadingDesktop) return 'windows';
  return isNativeApp() ? 'android' : null;
}

export function useReleaseUpdates(): ReleaseUpdates | null {
  const [platform] = useState(getInstalledPlatform);
  const [checkCount, setCheckCount] = useState(0);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult>({ status: 'checking', release: null });

  useEffect(() => {
    if (!platform) return;

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    async function check(platform: InstalledPlatform) {
      try {
        const release = await findReleaseUpdate(currentVersion, platform, controller.signal);
        if (active) {
          setResult(release ? { status: 'available', release } : { status: 'current', release: null });
        }
      } catch {
        if (active) setResult({ status: 'error', release: null });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void check(platform);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [platform, checkCount]);

  if (!platform) return null;

  return {
    ...result,
    currentVersion,
    showNotice: result.release !== null && result.release.version !== dismissedVersion,
    check() {
      if (result.status === 'checking') return;
      setResult({ status: 'checking', release: null });
      setCheckCount((count) => count + 1);
    },
    dismiss() {
      if (result.release) setDismissedVersion(result.release.version);
    },
  };
}

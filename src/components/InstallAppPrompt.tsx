import React, { useEffect, useState } from 'react';
import { Download, Plus, Share, SquarePlus, X } from 'lucide-react';

/**
 * Friendly "install MyFav as an app" card, tailored to the visitor's device:
 *  - iPhone / iPad (Safari or other browsers): Share -> Add to Home Screen steps
 *  - Android / desktop Chrome & Edge: one-tap Install (beforeinstallprompt)
 *  - Mac Safari: File -> Add to Dock
 * Never shown when MyFav is already running as an installed app, or on
 * browsers that cannot install web apps. "Not now" hides it for 30 days.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'mac-safari' | 'native-prompt' | 'none';

// The browser may offer installation before React mounts, so the event is
// captured once at module load and shared with every component that needs it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own friendly UI instead of the browser's mini-bar
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** Current install options for this device; re-renders when they change. */
export function useInstallOptions() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const installed = isRunningAsInstalledApp();
  const platform: InstallPlatform = installed
    ? 'none'
    : deferredPrompt
    ? 'native-prompt'
    : detectInstallPlatform();
  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const ev = deferredPrompt;
    if (!ev) return 'unavailable';
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    deferredPrompt = null;
    notify();
    return choice?.outcome ?? 'dismissed';
  };
  return { installed, platform, install };
}

const DISMISS_KEY = 'myfav_install_prompt_dismissed_at';
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 6000;

export function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true
  );
}

export function detectInstallPlatform(): Exclude<InstallPlatform, 'native-prompt'> {
  if (typeof navigator === 'undefined') return 'none';
  const ua = navigator.userAgent;
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || isIPadOS) return 'ios';
  const isMac = /Macintosh/.test(ua) && navigator.maxTouchPoints <= 1;
  const isSafari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  if (isMac && isSafari) return 'mac-safari';
  return 'none';
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export const InstallAppPrompt: React.FC<{ suppressed?: boolean }> = ({ suppressed = false }) => {
  const { installed, platform, install: runInstall } = useInstallOptions();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (installed || recentlyDismissed()) return;
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [installed]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const install = async () => {
    const outcome = await runInstall();
    if (outcome === 'accepted') setVisible(false);
    else dismiss();
  };

  if (!visible || suppressed || platform === 'none') return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Install MyFav as an app"
      data-testid="install-app-prompt"
      className="fixed z-30 left-3 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:left-auto lg:right-6 lg:bottom-6 lg:w-[360px] bg-slate-950/85 backdrop-blur-xl border border-white/12 rounded-2xl p-4 shadow-2xl shadow-black/40 animate-fadeIn"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl accent-subtle-bg accent-text flex items-center justify-center shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">Install MyFav as an app</p>
          {platform === 'native-prompt' && (
            <p className="text-xs text-slate-400 mt-0.5">
              Open your websites from your home screen or dock, in its own window.
            </p>
          )}
          {platform === 'ios' && (
            <ol className="mt-2 space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full accent-subtle-bg accent-text text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Tap <Share className="inline w-3.5 h-3.5 -mt-0.5 accent-text" aria-label="Share" />{' '}
                  <strong className="text-slate-100">Share</strong> in Safari
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full accent-subtle-bg accent-text text-[11px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Choose <SquarePlus className="inline w-3.5 h-3.5 -mt-0.5 accent-text" aria-hidden />{' '}
                  <strong className="text-slate-100">Add to Home Screen</strong>
                </span>
              </li>
            </ol>
          )}
          {platform === 'mac-safari' && (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              In Safari's menu bar, choose{' '}
              <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-slate-200">File → Add to Dock</span>.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {platform === 'native-prompt' && (
              <button
                type="button"
                onClick={install}
                className="min-h-[38px] px-4 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="min-h-[38px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 cursor-pointer"
            >
              {platform === 'native-prompt' ? 'Not now' : 'Got it'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="w-8 h-8 -mt-1 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

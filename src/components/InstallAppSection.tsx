import React, { useState } from 'react';
import { CheckCircle2, Download, MonitorSmartphone, Plus } from 'lucide-react';
import { useInstallOptions } from './InstallAppPrompt';

/** Settings section: how to use MyFav as an installed app on this device. */
export const InstallAppSection: React.FC = () => {
  const { installed, platform, install } = useInstallOptions();
  const [message, setMessage] = useState('');
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /Android/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  const onInstall = async () => {
    const outcome = await install();
    setMessage(
      outcome === 'accepted'
        ? 'MyFav is installed. Open it from your home screen, app list or dock.'
        : outcome === 'dismissed'
        ? 'Installation cancelled. You can install it any time from here.'
        : ''
    );
  };

  return (
    <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-3" data-testid="install-app-section">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
          <MonitorSmartphone className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-100">Install MyFav as an app</h2>
          <p className="text-xs text-slate-400">
            Open MyFav from your home screen or dock, full screen, like any other app.
          </p>
        </div>
      </div>

      {installed ? (
        <p className="text-xs text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> You're using the installed MyFav app.
        </p>
      ) : platform === 'native-prompt' ? (
        <button
          type="button"
          onClick={onInstall}
          className="min-h-[40px] px-4 rounded-xl accent-bg text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install MyFav</span>
        </button>
      ) : (
        <ul className="text-xs text-slate-300 space-y-1.5 list-none">
          {platform === 'ios' && (
            <li>
              <strong className="text-slate-100">iPhone / iPad:</strong> tap <em>Share</em>, then{' '}
              <em>Add to Home Screen</em>, keep <em>Open as Web App</em> on, and tap <em>Add</em>.
            </li>
          )}
          {platform === 'mac-safari' && (
            <li>
              <strong className="text-slate-100">Mac (Safari):</strong> choose <em>File → Add to Dock</em>.
            </li>
          )}
          {platform === 'none' && isAndroid && (
            <li>
              <strong className="text-slate-100">Android:</strong> open the browser menu{' '}
              <span aria-hidden>⋮</span> and choose <em>Install app</em> or <em>Add to Home screen</em>.
            </li>
          )}
          {platform === 'none' && !isAndroid && isFirefox && (
            <li>
              Firefox on computers can't install web apps. Open MyFav in Chrome, Edge or Safari to install
              it, or just bookmark this page.
            </li>
          )}
          {platform === 'none' && !isAndroid && !isFirefox && (
            <li>
              <strong className="text-slate-100">Chrome / Edge:</strong> click the install icon{' '}
              <Plus className="inline w-3.5 h-3.5 -mt-0.5" /> at the right end of the address bar, or open the
              browser menu and choose <em>Install MyFav</em>.
            </li>
          )}
        </ul>
      )}
      {message && <p className="text-xs text-slate-400">{message}</p>}
    </section>
  );
};

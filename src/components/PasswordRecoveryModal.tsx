/**
 * V2-only addition (no equivalent screen existed in the original UI because
 * Firebase hosted its own password-reset page). Neon Managed Better Auth
 * sends users back to the app with `?token=<reset token>`, so this dialog lets
 * them choose a new password. It reuses AuthPage's exact classes so it looks
 * like part of the original design system.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { MyFavLogo } from './MyFavLogo';
import {
  clearPasswordResetParams,
  completePasswordReset,
  readPasswordResetRedirect,
} from '../lib/auth';

export const PasswordRecoveryModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const redirect = readPasswordResetRedirect();
    if (!redirect) return;
    setResetToken(redirect.token);
    if (redirect.error) {
      setErrorMessage(
        'This password reset link is invalid or has expired. Request a new one from the login screen.'
      );
    }
    setIsOpen(true);
    clearPasswordResetParams();
  }, []);

  if (!isOpen) return null;

  const close = () => {
    setIsOpen(false);
    setResetToken(null);
    setPassword('');
    setConfirmPassword('');
    setErrorMessage('');
    setDoneMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!resetToken) {
      setErrorMessage(
        'This password reset link is invalid or has expired. Request a new one from the login screen.'
      );
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await completePasswordReset(resetToken, password);
      setDoneMessage('Your password has been updated. You can now log in with your new password.');
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Could not update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4 animate-fadeIn"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-modal-title"
        className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MyFavLogo size="sm" showText={false} />
              <h2
                id="recovery-modal-title"
                className="font-display text-base sm:text-lg font-bold text-slate-100 leading-snug text-balance"
              >
                Reset your password
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close password reset"
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}
          {doneMessage ? (
            <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-slate-100 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <span>{doneMessage}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="recovery-password" className="block text-xs font-medium text-slate-300">
                  New password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="recovery-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="recovery-confirm" className="block text-xs font-medium text-slate-300">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="recovery-confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl accent-bg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20 whitespace-nowrap"
              >
                <span>{isSubmitting ? 'Updating password...' : 'Update password'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

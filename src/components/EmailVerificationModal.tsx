/**
 * V2-only addition. Firebase verified emails with a hosted link; Neon Managed
 * Better Auth (shared email sender) verifies with a 6-digit code, so the user
 * needs somewhere to type it. Opens automatically when sign-up or sign-in
 * reports an unverified email. Reuses AuthPage's exact classes so it looks
 * like part of the original design system.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, X } from 'lucide-react';
import { MyFavLogo } from './MyFavLogo';
import {
  cancelEmailVerification,
  EMAIL_VERIFICATION_EVENT,
  resendVerificationCode,
  verifyEmailCode,
} from '../lib/auth';

export const EmailVerificationModal: React.FC = () => {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<{ email: string }>).detail;
      if (!detail?.email) return;
      setEmail(detail.email);
      setCode('');
      setErrorMessage('');
      setInfoMessage('');
      setDoneMessage('');
    };
    window.addEventListener(EMAIL_VERIFICATION_EVENT, onRequired);
    return () => window.removeEventListener(EMAIL_VERIFICATION_EVENT, onRequired);
  }, []);

  if (!email) return null;

  const close = () => {
    if (!doneMessage) cancelEmailVerification();
    setEmail(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');
    const digits = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(digits)) {
      setErrorMessage('Enter the 6-digit code from the email.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { signedIn } = await verifyEmailCode(email, digits);
      setDoneMessage(
        signedIn
          ? 'Email verified — you are now signed in.'
          : 'Email verified. You can now log in with your email and password.'
      );
      if (signedIn) setTimeout(() => setEmail(null), 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setErrorMessage('');
    setInfoMessage('');
    setIsResending(true);
    try {
      await resendVerificationCode(email);
      setInfoMessage(`A new code was sent to ${email}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? err.message : 'Could not send a new code.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4 animate-fadeIn"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-modal-title"
        className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MyFavLogo size="sm" showText={false} />
              <h2
                id="verify-modal-title"
                className="font-display text-base sm:text-lg font-bold text-slate-100 leading-snug text-balance"
              >
                Verify your email
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close email verification"
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
          {infoMessage && !errorMessage && (
            <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-slate-100 leading-relaxed">
              {infoMessage}
            </div>
          )}
          {doneMessage ? (
            <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-slate-100 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <span>{doneMessage}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                We sent a 6-digit code to <span className="text-slate-100 font-medium">{email}</span>. It may take a
                minute to arrive — check your spam folder too.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="verify-code" className="block text-xs font-medium text-slate-300">
                  Verification code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                    placeholder="123456"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm tracking-[0.3em] text-slate-100 placeholder:text-slate-500 placeholder:tracking-normal focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl accent-bg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20 whitespace-nowrap"
              >
                <span>{isSubmitting ? 'Verifying...' : 'Verify email'}</span>
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="w-full text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResending ? 'Sending a new code...' : "Didn't get it? Send a new code"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

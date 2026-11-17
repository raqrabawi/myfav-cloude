import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import { MyFavLogo } from './MyFavLogo';

export type AuthPageMode = 'login' | 'register';

interface AuthPageProps {
  isOpen: boolean;
  mode: AuthPageMode;
  onModeChange: (mode: AuthPageMode) => void;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailRegister: (name: string, email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
}

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your details and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Log in or reset your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password authentication is not enabled yet in Firebase Console (Authentication → Sign-in method → Email/Password).';
    case 'auth/network-request-failed':
      return 'Network error while connecting. Check your internet connection and try again.';
    default:
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return 'Authentication failed. Please try again.';
  }
}

export const AuthPage: React.FC<AuthPageProps> = ({
  isOpen,
  mode,
  onModeChange,
  onClose,
  onGoogleLogin,
  onEmailLogin,
  onEmailRegister,
  onPasswordReset,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetView, setIsResetView] = useState(false);

  const [isGooglePending, setIsGooglePending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetSentMessage, setResetSentMessage] = useState('');

  useEffect(() => {
    setErrorMessage('');
    setResetSentMessage('');
    setIsResetView(false);
  }, [mode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isBusy = isGooglePending || isSubmitting;

  const handleGoogleClick = async () => {
    setErrorMessage('');
    setResetSentMessage('');
    setIsGooglePending(true);
    try {
      await onGoogleLogin();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (
        code !== 'auth/popup-closed-by-user' &&
        code !== 'auth/cancelled-popup-request'
      ) {
        setErrorMessage(mapFirebaseAuthError(err));
      }
    } finally {
      setIsGooglePending(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setResetSentMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (isResetView) {
      setIsSubmitting(true);
      try {
        await onPasswordReset(trimmedEmail);
        setResetSentMessage(
          `Password reset link sent to ${trimmedEmail}. Check your inbox and spam folder.`
        );
      } catch (err) {
        setErrorMessage(mapFirebaseAuthError(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await onEmailLogin(trimmedEmail, password);
      } else {
        await onEmailRegister(name.trim(), trimmedEmail, password);
      }
    } catch (err) {
      setErrorMessage(mapFirebaseAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="w-10 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MyFavLogo size="sm" showText={false} />
              <h2
                id="auth-modal-title"
                className="font-display text-base sm:text-lg font-bold text-slate-100 leading-snug text-balance"
              >
                Sign in to sync your saved web directory.
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close login popup"
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Segmented Mode Switch */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 p-1 rounded-xl bg-slate-950/60 border border-white/10 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login' && !isResetView}
              onClick={() => {
                setIsResetView(false);
                onModeChange('login');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'login'
                  ? 'accent-bg text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Log in</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setIsResetView(false);
                onModeChange('register');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'register'
                  ? 'accent-bg text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Create account</span>
            </button>
          </div>

          {!isResetView && (
            <>
              {/* Google Sign-In Button */}
              <button
                type="button"
                disabled={isBusy}
                onClick={handleGoogleClick}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-sm font-semibold text-slate-100 flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0"
                >
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
                  />
                  <path
                    fill="#34A853"
                    d="M3.6 7.3l3.2 2.3C7.7 7.6 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.3z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12 21.5c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.8.6-1.9 1-3.4 1-3.9 0-5.2-2.6-5.5-3.8l-3.2 2.5c1.5 3 4.7 5.1 8.7 5.1z"
                  />
                  <path
                    fill="#4285F4"
                    d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.4-1.1 2.4-2.1 3.1l3 2.4c1.8-1.6 2.7-4.1 2.7-7.8z"
                  />
                </svg>
                <span>
                  {isGooglePending
                    ? 'Connecting with Google...'
                    : 'Continue with Google'}
                </span>
              </button>

              {/* Hairline Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  or continue with email
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          {resetSentMessage && (
            <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-slate-100 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <span>{resetSentMessage}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {isResetView && (
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-100">
                  Reset your password
                </h3>
                <p className="text-xs text-slate-400">
                  Enter your account email and we will send you a password reset link.
                </p>
              </div>
            )}

            {!isResetView && mode === 'register' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-300"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            {!isResetView && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage('');
                        setResetSentMessage('');
                        setIsResetView(true);
                      }}
                      className="text-xs accent-text hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'register'
                        ? 'At least 6 characters'
                        : 'Enter your password'
                    }
                    className="w-full min-h-[44px] pl-10 pr-11 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {!isResetView && mode === 'register' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-xs font-medium text-slate-300"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full min-h-[44px] pl-10 pr-11 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl accent-bg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20 whitespace-nowrap"
            >
              {isResetView ? (
                <span>
                  {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
                </span>
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{isSubmitting ? 'Logging in...' : 'Log in'}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {isSubmitting ? 'Creating account...' : 'Create account'}
                  </span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-white/8 text-center text-xs text-slate-400">
            {isResetView ? (
              <button
                type="button"
                onClick={() => {
                  setIsResetView(false);
                  setErrorMessage('');
                  setResetSentMessage('');
                }}
                className="accent-text font-semibold hover:underline cursor-pointer"
              >
                Back to Log in
              </button>
            ) : mode === 'login' ? (
              <span>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => onModeChange('register')}
                  className="accent-text font-semibold hover:underline cursor-pointer"
                >
                  Create account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onModeChange('login')}
                  className="accent-text font-semibold hover:underline cursor-pointer"
                >
                  Log in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

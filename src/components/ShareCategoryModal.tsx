import React, { useEffect, useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Trash2,
  Globe,
  X,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { User } from '../lib/auth';
import { BookmarkItem, CategoryItem, SharedCategoryRecord } from '../types';
import { CategoryIcon } from './CategoryIcon';

interface ShareCategoryModalProps {
  category: CategoryItem;
  subcategories: CategoryItem[];
  bookmarks: BookmarkItem[];
  existingShare: SharedCategoryRecord | null;
  user: User | null;
  onSignIn: () => Promise<void>;
  onPublishOrUpdateShare: (category: CategoryItem) => Promise<SharedCategoryRecord>;
  onRevokeShare: (shareId: string) => Promise<void>;
  onPreviewSharedPage: (shareId: string) => void;
  onClose: () => void;
}

export const ShareCategoryModal: React.FC<ShareCategoryModalProps> = ({
  category,
  subcategories,
  bookmarks,
  existingShare,
  user,
  onSignIn,
  onPublishOrUpdateShare,
  onRevokeShare,
  onPreviewSharedPage,
  onClose,
}) => {
  const [activeShare, setActiveShare] = useState<SharedCategoryRecord | null>(existingShare);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setActiveShare(existingShare);
  }, [existingShare]);

  // Automatically generate a public link when an authenticated user opens the modal for an unshared category
  useEffect(() => {
    let cancelled = false;
    const autoPublish = async () => {
      if (!user || existingShare || activeShare || isPublishing) return;
      setIsPublishing(true);
      setError('');
      try {
        const created = await onPublishOrUpdateShare(category);
        if (!cancelled) {
          setActiveShare(created);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not generate public share link.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsPublishing(false);
        }
      }
    };
    autoPublish();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, category.id]);

  const shareUrl = activeShare
    ? `${window.location.origin}/?share=${encodeURIComponent(activeShare.id)}`
    : '';

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignInAndPublish = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      await onSignIn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Google sign-in failed. Please try again.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleUpdateSnapshot = async () => {
    setIsPublishing(true);
    setError('');
    setStatusMessage('');
    try {
      const updated = await onPublishOrUpdateShare(category);
      setActiveShare(updated);
      setStatusMessage('Public link updated with your latest bookmarks and subcategories.');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to refresh public share.'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeShare) return;
    setIsRevoking(true);
    setError('');
    try {
      await onRevokeShare(activeShare.id);
      setActiveShare(null);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to revoke public link.'
      );
    } finally {
      setIsRevoking(false);
    }
  };

  const categoryBookmarksCount = bookmarks.filter(
    (b) => b.categoryId === category.id
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="glass-elevated rounded-2xl w-full max-w-lg border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-100 truncate">
                Share &ldquo;{category.name}&rdquo;
              </h2>
              <p className="text-xs text-slate-400">
                Public, read-only curated collection link
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share modal"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Category Summary Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                <CategoryIcon
                  name={category.icon}
                  categoryName={category.name}
                  className="w-4 h-4"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {category.name}
                </p>
                <p className="text-[11px] text-slate-400 font-mono-tabular">
                  {categoryBookmarksCount}{' '}
                  {categoryBookmarksCount === 1 ? 'website' : 'websites'} ·{' '}
                  {subcategories.length}{' '}
                  {subcategories.length === 1 ? 'subcategory' : 'subcategories'}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold shrink-0">
              <Globe className="w-3 h-3" />
              <span>Read-Only</span>
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          {statusMessage && (
            <div className="p-3 rounded-xl accent-subtle-bg border accent-border text-xs text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 accent-text shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {!user ? (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-100">
                    Log in to Publish Public Link
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Hosting a public, read-only link saves a snapshot of this category to your cloud workspace so anyone with the URL can view it from any browser or device.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={handleSignInAndPublish}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
                <span>Log in</span>
              </button>
            </div>
          ) : isPublishing && !activeShare ? (
            <div className="p-6 rounded-xl bg-slate-950/60 border border-white/10 flex flex-col items-center justify-center gap-2.5 text-center">
              <RefreshCw className="w-5 h-5 accent-text animate-spin" />
              <p className="text-xs font-medium text-slate-300">
                Generating your public read-only link...
              </p>
            </div>
          ) : activeShare ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Public Read-Only Share Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-950/80 border border-white/10 text-xs font-mono-tabular text-slate-200 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="min-h-[40px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-md"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Anyone with this link can browse and open websites in this collection in read-only mode. Your other categories and settings remain private.
                </p>
              </div>

              {(categoryBookmarksCount > 500 || subcategories.length > 100) && (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                  Public snapshots include up to 100 subcategories and 500 websites per shared category.
                </p>
              )}

              <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={handleUpdateSnapshot}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isPublishing ? 'animate-spin' : ''}`}
                    />
                    <span>{isPublishing ? 'Syncing...' : 'Sync Latest Changes'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onPreviewSharedPage(activeShare.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 accent-text" />
                    <span>View Shared Page</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={handleRevoke}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isRevoking ? 'Revoking...' : 'Revoke Link'}</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleUpdateSnapshot}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Generate Public Read-Only Link</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

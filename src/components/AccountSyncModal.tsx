import React, { useState } from 'react';
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  HardDrive,
  RotateCcw,
  Chrome,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export interface SyncSummaryCounts {
  categories: number;
  bookmarks: number;
  shortcuts: number;
}

interface AccountSyncModalProps {
  isOpen: boolean;
  userEmail: string;
  userName?: string | null;
  hasLocalData: boolean;
  hasCloudData: boolean;
  localCounts: SyncSummaryCounts;
  cloudCounts: SyncSummaryCounts;
  isProcessing: boolean;
  error?: string;
  onSyncLocalToCloud: () => Promise<void>;
  onKeepLocalOnly: () => Promise<void>;
  onGetCloudAndSync: () => Promise<void>;
  onStartFresh: (goToChromeSync?: boolean) => Promise<void>;
}

export const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  isOpen,
  userEmail,
  userName,
  hasLocalData,
  hasCloudData,
  localCounts,
  cloudCounts,
  isProcessing,
  error,
  onSyncLocalToCloud,
  onKeepLocalOnly,
  onGetCloudAndSync,
  onStartFresh,
}) => {
  const [confirmFresh, setConfirmFresh] = useState(false);

  if (!isOpen) return null;

  const displayName = userName?.trim() || userEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4">
      <div className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/15">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="w-10 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4 sm:hidden" />

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
                {hasLocalData
                  ? 'Sync Your Local Workspace?'
                  : 'Welcome to Cloud Sync'}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Signed in as <span className="text-slate-200 font-medium">{displayName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Data Comparison Strip */}
          {hasLocalData ? (
            <div className="grid grid-cols-2 border border-white/10 rounded-xl divide-x divide-white/10 bg-slate-950/55">
              <div className="p-3.5">
                <span className="block text-[11px] text-slate-400">On This Computer</span>
                <span className="mt-1 block text-xs sm:text-sm font-semibold text-slate-100 font-mono-tabular">
                  {localCounts.categories} folders · {localCounts.bookmarks} sites
                </span>
              </div>
              <div className="p-3.5">
                <span className="block text-[11px] text-slate-400">Saved in Cloud</span>
                <span className="mt-1 block text-xs sm:text-sm font-semibold text-slate-100 font-mono-tabular">
                  {cloudCounts.categories} folders · {cloudCounts.bookmarks} sites
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/55 flex items-center justify-between gap-3">
              <div>
                <span className="block text-[11px] text-slate-400">
                  Saved in Your Account
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-slate-100 font-mono-tabular">
                  {hasCloudData
                    ? `${cloudCounts.categories} categories · ${cloudCounts.bookmarks} websites`
                    : 'No saved categories or websites yet'}
                </span>
              </div>
              <CloudDownload className="w-5 h-5 accent-text shrink-0" />
            </div>
          )}

          {/* Decision Options */}
          {hasLocalData ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                You already added websites or categories on this computer. Choose how you want to continue:
              </p>

              {/* Option 1: Sync local data to Google */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setConfirmFresh(false);
                  void onSyncLocalToCloud();
                }}
                className="w-full p-4 rounded-xl accent-bg text-white text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <CloudUpload className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold">
                      Sync Data to Google Account
                    </span>
                    <span className="block text-[11px] text-white/85 mt-0.5">
                      {hasCloudData
                        ? 'Upload your local sites & categories and merge with your saved Google data without duplicates.'
                        : 'Save your local categories and websites to your Google account so they sync across devices.'}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              {/* Option 2: Keep locally on computer */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setConfirmFresh(false);
                  void onKeepLocalOnly();
                }}
                className="w-full p-4 rounded-xl bg-slate-950/60 hover:bg-white/10 border border-white/10 hover:border-white/25 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <HardDrive className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold text-slate-100">
                      Keep Data Locally on This Computer
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      Keep everything stored only on this browser without uploading to or syncing with Google.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {/* Option 3: Clear Start */}
              {confirmFresh ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-200 leading-relaxed">
                      Start a clear start? This will clear your local items
                      {hasCloudData ? ' and saved Google account items' : ''} so you begin with an empty workspace.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setConfirmFresh(false)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void onStartFresh(false)}
                      className="min-h-[36px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? 'Clearing...' : 'Confirm Clear Start'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setConfirmFresh(true)}
                  className="w-full p-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <RotateCcw className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="block text-xs sm:text-sm font-semibold text-rose-200">
                        Start a Clear Start
                      </span>
                      <span className="block text-[11px] text-rose-200/75 mt-0.5">
                        Remove current items and start with a completely empty workspace linked to Google.
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-rose-300 shrink-0" />
                </button>
              )}
            </div>
          ) : hasCloudData ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                We found previously saved data in your Google account. Would you like to load and sync it, or begin with a fresh start?
              </p>

              {/* Option 1: Get Saved Data & Sync */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setConfirmFresh(false);
                  void onGetCloudAndSync();
                }}
                className="w-full p-4 rounded-xl accent-bg text-white text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <CloudDownload className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold">
                      Get Saved Data &amp; Sync
                    </span>
                    <span className="block text-[11px] text-white/85 mt-0.5">
                      Load all {cloudCounts.categories} categories and {cloudCounts.bookmarks} websites from your Google account.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              {/* Option 2: Fresh Start */}
              {confirmFresh ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-200 leading-relaxed">
                      Start a fresh start? This will permanently delete the {cloudCounts.bookmarks} saved websites and {cloudCounts.categories} categories in your Google account.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setConfirmFresh(false)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void onStartFresh(false)}
                      className="min-h-[36px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? 'Resetting...' : 'Confirm Fresh Start'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setConfirmFresh(true)}
                  className="w-full p-4 rounded-xl bg-slate-950/60 hover:bg-white/10 border border-white/10 hover:border-white/25 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <RotateCcw className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="block text-xs sm:text-sm font-semibold text-slate-100">
                        Start a Fresh Start
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Clear your previously saved cloud items and start with an empty workspace.
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                Your Google account has no saved bookmarks yet. Choose how you would like to begin:
              </p>

              {/* Option 1: Start Fresh & Sync */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => void onGetCloudAndSync()}
                className="w-full p-4 rounded-xl accent-bg text-white text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-black/20"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Cloud className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold">
                      Start Fresh &amp; Enable Cloud Sync
                    </span>
                    <span className="block text-[11px] text-white/85 mt-0.5">
                      Begin with a clean empty workspace synced automatically to your Google account.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              {/* Option 2: Sync Chrome Bookmarks */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => void onStartFresh(true)}
                className="w-full p-4 rounded-xl bg-slate-950/60 hover:bg-white/10 border border-white/10 hover:border-white/25 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Chrome className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold text-slate-100">
                      Sync Chrome Bookmarks
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      Connect your Google account and open Chrome Sync in Settings to import your folders.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Bookmark,
  FolderTree,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ImportProgressState } from '../types';

interface ImportProgressPanelProps {
  progress: ImportProgressState;
  onDone: () => void;
  onReset?: () => void;
  doneLabel?: string;
}

const SPARKLE_ANGLES = [0, 55, 115, 180, 240, 305];

export const ImportProgressPanel: React.FC<ImportProgressPanelProps> = ({
  progress,
  onDone,
  onReset,
  doneLabel = 'View Imported Links',
}) => {
  const isComplete = progress.phase === 'complete';
  const rawPercent =
    progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : isComplete
      ? 100
      : 10;
  const percent = isComplete
    ? 100
    : Math.min(99, Math.max(progress.phase === 'reading' ? 8 : 12, rawPercent));

  const phaseLabel =
    progress.phase === 'reading'
      ? 'Reading file...'
      : progress.phase === 'preparing'
      ? 'Preparing workspace...'
      : progress.phase === 'categories'
      ? 'Organizing folders & categories...'
      : progress.phase === 'bookmarks'
      ? 'Importing website links...'
      : 'Import complete!';

  return (
    <div className="rounded-2xl bg-slate-950/70 border accent-border p-5 sm:p-6 overflow-hidden relative">
      <AnimatePresence mode="wait">
        {!isComplete ? (
          <motion.div
            key="importing-state"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            {/* Header with Smooth Circular Orbital Spinner & Icon Container */}
            <div className="flex items-center gap-3.5">
              <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                {/* Subtle static circular track */}
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                {/* Smooth circular spinning arc */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] border-r-[var(--accent-light)]"
                />
                {/* Circular icon container */}
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                  className="w-9 h-9 rounded-full accent-subtle-bg flex items-center justify-center accent-text"
                >
                  <Upload className="w-4 h-4" />
                </motion.div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {phaseLabel}
                  </p>
                  <span className="text-xs font-bold font-mono-tabular accent-text shrink-0">
                    {percent}%
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {progress.sourceLabel
                    ? `File: ${progress.sourceLabel}`
                    : 'Processing bookmarks into MyFav'}
                </p>
              </div>
            </div>

            {/* Smooth Progress Track + Shimmer */}
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded-full bg-white/8 overflow-hidden relative">
                <motion.div
                  initial={{ width: '8%' }}
                  animate={{ width: `${percent}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  className="h-full rounded-full accent-bg relative overflow-hidden"
                >
                  <motion.div
                    animate={{ x: ['-100%', '220%'] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.15,
                      ease: 'easeInOut',
                    }}
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                  />
                </motion.div>
              </div>

              {/* Live Item & Count Row */}
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                <span className="truncate">
                  {progress.currentTitle
                    ? `Importing: ${progress.currentTitle}`
                    : 'Preparing your curated links...'}
                </span>
                <span className="font-mono-tabular shrink-0 text-slate-300">
                  {progress.processed} / {Math.max(1, progress.total)}
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="complete-state"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="text-center space-y-4 py-1"
          >
            {/* Celebratory Ripple + Sparkles + Circular Animated SVG Checkmark */}
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              {/* Outer Expanding Ripple Wave */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0.75 }}
                animate={{ scale: 1.85, opacity: 0 }}
                transition={{ duration: 0.85, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full border-2 border-emerald-400/70 pointer-events-none"
              />
              <motion.div
                initial={{ scale: 0.75, opacity: 0.55 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.7, delay: 0.12, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full bg-emerald-400/20 pointer-events-none"
              />

              {/* Radial Burst Sparkles */}
              {SPARKLE_ANGLES.map((angle, idx) => {
                const rad = (angle * Math.PI) / 180;
                const tx = Math.cos(rad) * 34;
                const ty = Math.sin(rad) * 34;
                return (
                  <motion.span
                    key={angle}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{
                      x: tx,
                      y: ty,
                      scale: [0, 1.15, 0],
                      opacity: [1, 1, 0],
                    }}
                    transition={{
                      duration: 0.75,
                      delay: 0.08 + idx * 0.03,
                      ease: 'easeOut',
                    }}
                    className={`absolute w-2 h-2 rounded-full pointer-events-none ${
                      idx % 2 === 0 ? 'bg-emerald-400' : 'accent-bg'
                    }`}
                  />
                );
              })}

              {/* Circular Spring Badge with Self-Drawing Checkmark */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shadow-lg shadow-emerald-500/15"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-7 h-7 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.38, delay: 0.14, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>
            </div>

            {/* Completion Message */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.25 }}
              className="space-y-1"
            >
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Links Synced</span>
              </div>
              <h3 className="text-base font-bold text-slate-100">
                {progress.addedBookmarks > 0
                  ? `Successfully imported ${progress.addedBookmarks} ${
                      progress.addedBookmarks === 1 ? 'link' : 'links'
                    }!`
                  : 'Your bookmarks are up to date!'}
              </h3>
              {progress.sourceLabel && (
                <p className="text-xs text-slate-400 truncate max-w-sm mx-auto">
                  From <span className="text-slate-300">{progress.sourceLabel}</span>
                </p>
              )}
            </motion.div>

            {/* Staggered Result Summary Tiles */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.25 }}
              className="grid grid-cols-2 gap-2.5 max-w-xs mx-auto"
            >
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2">
                <Bookmark className="w-3.5 h-3.5 accent-text shrink-0" />
                <div className="text-left">
                  <span className="block text-sm font-bold font-mono-tabular text-slate-100 leading-tight">
                    {progress.addedBookmarks}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Links Added
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2">
                <FolderTree className="w-3.5 h-3.5 accent-text shrink-0" />
                <div className="text-left">
                  <span className="block text-sm font-bold font-mono-tabular text-slate-100 leading-tight">
                    {progress.addedCategories}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Folders Added
                  </span>
                </div>
              </div>
            </motion.div>

            {progress.skippedDuplicates > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32 }}
                className="text-[11px] text-slate-400"
              >
                {progress.skippedDuplicates} existing duplicate{' '}
                {progress.skippedDuplicates === 1 ? 'link' : 'links'} skipped automatically
              </motion.p>
            )}

            {/* Interactive Finish Actions */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, duration: 0.22 }}
              className="pt-1 flex flex-wrap items-center justify-center gap-2.5"
            >
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onDone}
                className="min-h-[40px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-black/25 cursor-pointer"
              >
                <span>{doneLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              {onReset && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onReset}
                  className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Import Another</span>
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

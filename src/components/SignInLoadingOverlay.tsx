import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bookmark, Cloud, Globe, Link2, Star, Folder } from 'lucide-react';
import myFavLogoImg from '../assets/images/myfav_app_logo_160.webp';

export type SignInLoadingStage = 'signing-in' | 'syncing' | 'loading';

interface SignInLoadingOverlayProps {
  /** null = hidden */
  stage: SignInLoadingStage | null;
}

const STAGES: { id: SignInLoadingStage; label: string; hint: string }[] = [
  { id: 'signing-in', label: 'Signing you in', hint: 'Confirming your account securely' },
  { id: 'syncing', label: 'Syncing your websites', hint: 'Merging this device with your account' },
  { id: 'loading', label: 'Loading your Main Page', hint: 'Bringing in your websites & categories' },
];

// Small "link" tiles that orbit and get pulled into the logo, like bookmarks
// being collected into your workspace.
const ORBITERS = [
  { Icon: Globe, angle: 0 },
  { Icon: Bookmark, angle: 60 },
  { Icon: Star, angle: 120 },
  { Icon: Link2, angle: 180 },
  { Icon: Folder, angle: 240 },
  { Icon: Cloud, angle: 300 },
];

/** Only appear if loading lasts long enough to notice, so fast loads don't flash. */
const SHOW_DELAY_MS = 180;

export const SignInLoadingOverlay: React.FC<SignInLoadingOverlayProps> = ({ stage }) => {
  const reduceMotion = useReducedMotion();
  const [visibleStage, setVisibleStage] = useState<SignInLoadingStage | null>(null);

  useEffect(() => {
    if (!stage) {
      setVisibleStage(null);
      return;
    }
    if (visibleStage) {
      setVisibleStage(stage);
      return;
    }
    const t = setTimeout(() => setVisibleStage(stage), SHOW_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const activeIndex = visibleStage ? STAGES.findIndex((s) => s.id === visibleStage) : -1;
  const current = activeIndex >= 0 ? STAGES[activeIndex] : null;

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="signin-loading-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={`${current.label}…`}
          data-testid="signin-loading-overlay"
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop: blurred glass with a slow accent aurora */}
          <div className="absolute inset-0 bg-slate-950/70 [html.light_&]:bg-slate-100/75 backdrop-blur-xl" />
          {!reduceMotion && (
            <motion.div
              aria-hidden
              className="absolute w-[42rem] h-[42rem] rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(var(--accent-rgb),0.55), transparent 60%), radial-gradient(circle at 70% 70%, rgba(var(--accent-rgb),0.35), transparent 55%)',
              }}
              animate={{ rotate: 360, scale: [1, 1.08, 1] }}
              transition={{
                rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
          )}

          <motion.div
            className="relative glass-elevated rounded-3xl px-8 py-9 sm:px-12 sm:py-10 w-full max-w-sm text-center shadow-2xl"
            initial={{ y: 16, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* Orbit stage */}
            <div className="relative mx-auto w-40 h-40" aria-hidden>
              {/* Rotating conic ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0deg, rgba(var(--accent-rgb),0.9) 70deg, transparent 140deg, transparent 360deg)',
                  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
                }}
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 rounded-full border border-[var(--glass-border)]" />

              {/* Orbiting link tiles, pulled toward the center */}
              <motion.div
                className="absolute inset-0"
                animate={reduceMotion ? undefined : { rotate: -360 }}
                transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
              >
                {ORBITERS.map(({ Icon, angle }, i) => (
                  <div
                    key={angle}
                    className="absolute left-1/2 top-1/2"
                    style={{ transform: `rotate(${angle}deg)` }}
                  >
                    <motion.div
                      className="-ml-3.5 -mt-3.5 w-7 h-7 rounded-lg glass-surface accent-text flex items-center justify-center shadow-md"
                      initial={{ y: -66, opacity: 0, scale: 0.6 }}
                      animate={
                        reduceMotion
                          ? { y: -66, opacity: 0.9, scale: 1 }
                          : {
                              y: [-66, -66, -66, -26],
                              opacity: [0, 1, 1, 0],
                              scale: [0.6, 1, 1, 0.4],
                            }
                      }
                      transition={
                        reduceMotion
                          ? { duration: 0.3 }
                          : {
                              duration: 2.4,
                              times: [0, 0.2, 0.75, 1],
                              repeat: Infinity,
                              delay: i * 0.4,
                              ease: 'easeInOut',
                            }
                      }
                    >
                      <Icon className="w-3.5 h-3.5" style={{ transform: `rotate(${-angle}deg)` }} />
                    </motion.div>
                  </div>
                ))}
              </motion.div>

              {/* Center logo with breathing glow */}
              <motion.div
                className="absolute inset-0 m-auto w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-white/10"
                style={{ boxShadow: '0 0 0 0 rgba(var(--accent-rgb),0.45)' }}
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [1, 1.06, 1],
                        boxShadow: [
                          '0 0 0 0 rgba(var(--accent-rgb),0.45)',
                          '0 0 0 14px rgba(var(--accent-rgb),0)',
                          '0 0 0 0 rgba(var(--accent-rgb),0)',
                        ],
                      }
                }
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img src={myFavLogoImg} alt="" className="w-full h-full object-cover" />
              </motion.div>
            </div>

            {/* Stage text */}
            <div className="mt-7 h-12 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0"
                >
                  <p className="text-base font-semibold text-slate-100 [html.light_&]:text-slate-900">
                    {current.label}
                    <span className="inline-flex w-5 justify-start" aria-hidden>
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          animate={reduceMotion ? undefined : { opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }}
                        >
                          .
                        </motion.span>
                      ))}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 [html.light_&]:text-slate-500 mt-1">{current.hint}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Shimmering indeterminate progress bar */}
            <div className="mt-5 h-1.5 w-full rounded-full overflow-hidden relative"
              style={{ backgroundColor: 'rgba(var(--accent-rgb),0.16)' }}>
              <motion.div
                className="absolute inset-y-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--accent-primary), var(--accent-light), transparent)',
                  width: '45%',
                }}
                animate={reduceMotion ? { left: '27.5%' } : { left: ['-45%', '100%'] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            {/* Step dots */}
            <div className="mt-4 flex items-center justify-center gap-2" aria-hidden>
              {STAGES.map((s, i) => (
                <motion.span
                  key={s.id}
                  className="h-1.5 rounded-full"
                  animate={{
                    width: i === activeIndex ? 20 : 6,
                    backgroundColor:
                      i <= activeIndex ? 'var(--accent-primary)' : 'rgba(148,163,184,0.35)',
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

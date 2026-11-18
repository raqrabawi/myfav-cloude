import React, { Suspense, useState } from 'react';

/**
 * Renders its children (usually a React.lazy component) only once `when` has
 * been true at least once, and keeps them mounted afterwards. The lazy chunk
 * is therefore not downloaded at startup, but after the first open the
 * component behaves exactly as if it had always been mounted.
 */
export function Deferred({
  when,
  fallback = null,
  children,
}: {
  when: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [activated, setActivated] = useState(when);
  if (when && !activated) setActivated(true);
  if (!activated) return null;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

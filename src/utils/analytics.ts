// MyFav V2: the Firebase Analytics SDK bridge was removed together with Firebase.
// In the original, firebase-applet-config.json had an empty measurementId, so the
// Firebase branch never activated; GA4 (gtag) and GTM behaviour is unchanged.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __MYFAV_GA4_ID__?: string;
    __MYFAV_GTM_ID__?: string;
  }
}

const VALID_GA4_ID_REGEX = /^G-[A-Z0-9]{6,}$/i;
const VALID_GTM_ID_REGEX = /^GTM-[A-Z0-9]{5,}$/i;
const DEFAULT_GA4_MEASUREMENT_ID = 'G-EM5F71Y8GW';

let initializedMeasurementId: string | null = null;
let initializedGtmId: string | null = null;

export function getConfiguredMeasurementId(): string {
  const envId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA_MEASUREMENT_ID
      ? String(import.meta.env.VITE_GA_MEASUREMENT_ID).trim()
      : '';
  const candidate = envId || DEFAULT_GA4_MEASUREMENT_ID;
  return VALID_GA4_ID_REGEX.test(candidate) ? candidate : '';
}

export function getConfiguredGtmId(): string {
  const envId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GTM_ID
      ? String(import.meta.env.VITE_GTM_ID).trim()
      : '';
  const windowId =
    typeof window !== 'undefined' && typeof window.__MYFAV_GTM_ID__ === 'string'
      ? window.__MYFAV_GTM_ID__.trim()
      : '';

  const candidate = envId || windowId;
  return VALID_GTM_ID_REGEX.test(candidate) ? candidate.toUpperCase() : '';
}

export function initGoogleTagManager(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const gtmId = getConfiguredGtmId();
  if (!gtmId || initializedGtmId === gtmId) return;
  initializedGtmId = gtmId;

  window.dataLayer = window.dataLayer || [];

  const existingScript = document.querySelector(
    `script[src*="googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}"]`
  );
  if (!existingScript && window.__MYFAV_GTM_ID__ !== gtmId) {
    window.dataLayer.push({
      'gtm.start': new Date().getTime(),
      event: 'gtm.js',
    });

    const script = document.createElement('script');
    script.id = 'myfav-gtm-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.appendChild(script);
  }

  window.__MYFAV_GTM_ID__ = gtmId;
}

export async function initGoogleAnalytics(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  initGoogleTagManager();

  const measurementId = getConfiguredMeasurementId();
  if (!measurementId || initializedMeasurementId === measurementId) return;
  initializedMeasurementId = measurementId;

  // Initialize gtag.js for GA4 Measurement ID if not already bootstrapped in index.html
  if (window.__MYFAV_GA4_ID__ !== measurementId) {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer?.push(args);
      };
      window.gtag('js', new Date());
    }
    window.gtag('config', measurementId, {
      send_page_view: false,
    });
    window.__MYFAV_GA4_ID__ = measurementId;

    const scriptId = 'myfav-ga4-gtag';
    const existingScript = document.querySelector(
      `script[src*="googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}"]`
    );
    if (!document.getElementById(scriptId) && !existingScript) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }
  }
}

export function trackPageView(pagePath: string, pageTitle: string): void {
  if (typeof window === 'undefined') return;

  const measurementId = getConfiguredMeasurementId();
  const gtmId = getConfiguredGtmId();

  try {
    if (gtmId) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'virtual_page_view',
        page_path: pagePath,
        page_title: pageTitle,
      });
    }
    if (measurementId && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_title: pageTitle,
        send_to: measurementId,
      });
    }
  } catch {
    // Never let analytics disrupt app navigation
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return;

  const measurementId = getConfiguredMeasurementId();
  const gtmId = getConfiguredGtmId();

  try {
    if (gtmId) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        ...params,
      });
    }
    if (measurementId && window.gtag) {
      window.gtag('event', eventName, {
        ...params,
        send_to: measurementId,
      });
    }
  } catch {
    // Never let analytics disrupt user actions
  }
}

import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  Globe,
  RefreshCw,
  Monitor,
  Smartphone,
  Maximize2,
  Minimize2,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import { BookmarkItem, CategoryItem } from '../types';
import { CategoryIcon, extractDomain, WebsiteFavicon } from './CategoryIcon';

interface WebsitePreviewModalProps {
  bookmark: BookmarkItem | null;
  category?: CategoryItem | null;
  subcategory?: CategoryItem | null;
  onClose: () => void;
  /** Called when the user opens the website from the preview (usage counting). */
  onVisit?: (bookmark: BookmarkItem) => void;
}

export const WebsitePreviewModal: React.FC<WebsitePreviewModalProps> = ({
  bookmark,
  category,
  subcategory,
  onClose,
  onVisit,
}) => {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isExpandedModal, setIsExpandedModal] = useState(false);
  const [viewMode, setViewMode] = useState<'live' | 'snapshot'>('live');
  const [metaDescription, setMetaDescription] = useState<string>('');
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');

  useEffect(() => {
    if (!bookmark) return;
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
    setViewMode('live');
    setMetaDescription(bookmark.description || '');
    setSnapshotUrl('');

    const targetUrl = /^https?:\/\//i.test(bookmark.url.trim())
      ? bookmark.url.trim()
      : `https://${bookmark.url.trim()}`;

    let cancelled = false;
    // Fetch meta description & live screenshot backup in background
    fetch(
      `https://api.microlink.io?url=${encodeURIComponent(
        targetUrl
      )}&screenshot=true&meta=true`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        if (typeof json.data.description === 'string' && json.data.description.trim()) {
          setMetaDescription(json.data.description.trim());
        }
        if (json.data.screenshot?.url) {
          setSnapshotUrl(json.data.screenshot.url);
        } else if (json.data.image?.url) {
          setSnapshotUrl(json.data.image.url);
        }
      })
      .catch(() => {
        // ignore background metadata errors
      });

    return () => {
      cancelled = true;
    };
  }, [bookmark]);

  useEffect(() => {
    if (!bookmark) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookmark, onClose]);

  if (!bookmark) return null;

  const resolvedUrl = /^https?:\/\//i.test(bookmark.url.trim())
    ? bookmark.url.trim()
    : `https://${bookmark.url.trim()}`;
  const domain = extractDomain(resolvedUrl);
  const fallbackThumUrl = `https://image.thum.io/get/width/1200/crop/800/noanimate/${resolvedUrl}`;

  const handleReloadIframe = () => {
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-elevated w-full ${
          isExpandedModal
            ? 'sm:max-w-6xl h-[92vh]'
            : 'sm:max-w-4xl h-[85vh] sm:h-[82vh]'
        } rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl transition-all duration-200`}
      >
        {/* Top Modal Header + Mini Browser Toolbar */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Left: Favicon + Title + Category Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <WebsiteFavicon url={bookmark.url} title={bookmark.title} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {bookmark.title}
                </h2>
                {(subcategory || category) && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-[10px] font-medium text-slate-300 shrink-0">
                    <CategoryIcon
                      name={(subcategory || category)!.icon}
                      categoryName={(subcategory || category)!.name}
                      className="w-3 h-3 accent-text"
                    />
                    <span>{(subcategory || category)!.name}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono-tabular text-slate-400 truncate">
                {resolvedUrl}
              </p>
            </div>
          </div>

          {/* Right: Browser Preview Controls (Live vs Snapshot, Desktop/Mobile, Expand, Reload, Close) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Live Website vs Snapshot Switcher */}
            <div className="flex items-center p-0.5 rounded-xl bg-slate-950/70 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('live')}
                title="Interact with the live website directly"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'live'
                    ? 'accent-bg text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Live Site</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('snapshot')}
                title="View rendered visual snapshot (useful if website blocks iframe embedding)"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'snapshot'
                    ? 'accent-bg text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>Snapshot</span>
              </button>
            </div>

            {/* Desktop / Mobile Viewport Toggle */}
            {viewMode === 'live' && (
              <div className="hidden sm:flex items-center p-0.5 rounded-xl bg-slate-950/70 border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewportMode('desktop')}
                  title="Desktop width"
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    viewportMode === 'desktop'
                      ? 'accent-bg text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('mobile')}
                  title="Mobile width"
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    viewportMode === 'mobile'
                      ? 'accent-bg text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Reload Live Website */}
            <button
              type="button"
              onClick={handleReloadIframe}
              title="Reload website preview"
              aria-label="Reload website preview"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  iframeLoading && viewMode === 'live' ? 'animate-spin accent-text' : ''
                }`}
              />
            </button>

            {/* Expand / Restore Modal Size */}
            <button
              type="button"
              onClick={() => setIsExpandedModal((prev) => !prev)}
              title={isExpandedModal ? 'Compact preview window' : 'Expand preview window'}
              aria-label="Toggle preview window size"
              className="hidden sm:flex w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-100 items-center justify-center transition-colors cursor-pointer"
            >
              {isExpandedModal ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview modal"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Website Preview Box */}
        <div className="flex-1 min-h-0 bg-slate-950/80 relative flex items-center justify-center p-2 sm:p-3 overflow-hidden">
          {viewMode === 'live' ? (
            <div
              className={`relative h-full bg-white rounded-xl overflow-hidden border border-white/15 shadow-inner transition-all duration-300 ${
                viewportMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
              }`}
            >
              {iframeLoading && (
                <div className="absolute inset-0 z-10 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-center p-4">
                  <RefreshCw className="w-6 h-6 accent-text animate-spin" />
                  <p className="text-xs font-semibold text-slate-200">
                    Loading live preview of {domain}...
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    If the website restricts embedded frames, switch to{' '}
                    <button
                      type="button"
                      onClick={() => setViewMode('snapshot')}
                      className="accent-text underline font-semibold cursor-pointer"
                    >
                      Snapshot
                    </button>{' '}
                    or open in a new tab.
                  </p>
                </div>
              )}

              <iframe
                key={`${resolvedUrl}_${iframeKey}`}
                src={resolvedUrl}
                title={`Live preview of ${bookmark.title}`}
                onLoad={() => setIframeLoading(false)}
                onError={() => setIframeLoading(false)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-xl overflow-y-auto bg-slate-950 border border-white/10 flex flex-col items-center justify-start">
              <img
                src={snapshotUrl || fallbackThumUrl}
                alt={`Rendered snapshot of ${bookmark.title}`}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== fallbackThumUrl) {
                    target.src = fallbackThumUrl;
                  }
                }}
                className="w-full h-auto object-contain"
              />
            </div>
          )}
        </div>

        {/* Bottom Bar: Meta Description + Helper Notice + Visit Website Button */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            {metaDescription ? (
              <p className="text-xs text-slate-300 truncate" title={metaDescription}>
                {metaDescription}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 accent-text shrink-0" />
                <span>
                  Previewing <strong className="text-slate-200">{domain}</strong> — if the page appears blank due to browser security headers, click{' '}
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'live' ? 'snapshot' : 'live')}
                    className="accent-text hover:underline font-semibold cursor-pointer"
                  >
                    {viewMode === 'live' ? 'Snapshot View' : 'Live Site'}
                  </button>
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            {viewMode === 'live' && (
              <button
                type="button"
                onClick={() => setViewMode('snapshot')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                Can&apos;t see site? View Snapshot
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              Close
            </button>
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => bookmark && onVisit?.(bookmark)}
              onAuxClick={(e) => e.button === 1 && bookmark && onVisit?.(bookmark)}
              className="min-h-[38px] px-4 py-1.5 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
            >
              <span>Open Website</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

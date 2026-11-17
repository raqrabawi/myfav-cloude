import React, { useState } from 'react';
import {
  Sparkles,
  Image,
  Cpu,
  Wand2,
  Palette,
  Hexagon,
  Megaphone,
  Briefcase,
  Code2,
  Globe,
  Layers,
  Compass,
  Bookmark,
  Terminal,
  PenTool,
  Zap,
  Folder,
  Video,
  Music,
  ShoppingBag,
  Database,
  Shield,
  BookOpen,
  Rocket,
  Gamepad2,
} from 'lucide-react';
import { inferIconForFolderName } from '../utils/chromeBookmarksParser';

interface CategoryIconProps {
  name: string;
  categoryName?: string;
  className?: string;
  strokeWidth?: number;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  name,
  categoryName,
  className = 'w-4 h-4',
  strokeWidth = 2,
}) => {
  // If stored icon is generic ('bookmark' or 'folder' or empty) and categoryName is provided,
  // dynamically infer a rich, semantic icon from the category's title!
  const effectiveName =
    (!name || name === 'bookmark' || name === 'folder') && categoryName
      ? inferIconForFolderName(categoryName)
      : name;

  switch (effectiveName) {
    case 'sparkles':
      return <Sparkles className={className} strokeWidth={strokeWidth} />;
    case 'image':
      return <Image className={className} strokeWidth={strokeWidth} />;
    case 'video':
      return <Video className={className} strokeWidth={strokeWidth} />;
    case 'music':
      return <Music className={className} strokeWidth={strokeWidth} />;
    case 'cpu':
      return <Cpu className={className} strokeWidth={strokeWidth} />;
    case 'wand-2':
      return <Wand2 className={className} strokeWidth={strokeWidth} />;
    case 'palette':
      return <Palette className={className} strokeWidth={strokeWidth} />;
    case 'hexagon':
      return <Hexagon className={className} strokeWidth={strokeWidth} />;
    case 'megaphone':
      return <Megaphone className={className} strokeWidth={strokeWidth} />;
    case 'briefcase':
      return <Briefcase className={className} strokeWidth={strokeWidth} />;
    case 'shopping-bag':
      return <ShoppingBag className={className} strokeWidth={strokeWidth} />;
    case 'code-2':
      return <Code2 className={className} strokeWidth={strokeWidth} />;
    case 'database':
      return <Database className={className} strokeWidth={strokeWidth} />;
    case 'globe':
      return <Globe className={className} strokeWidth={strokeWidth} />;
    case 'layers':
      return <Layers className={className} strokeWidth={strokeWidth} />;
    case 'compass':
      return <Compass className={className} strokeWidth={strokeWidth} />;
    case 'book-open':
      return <BookOpen className={className} strokeWidth={strokeWidth} />;
    case 'shield':
      return <Shield className={className} strokeWidth={strokeWidth} />;
    case 'rocket':
      return <Rocket className={className} strokeWidth={strokeWidth} />;
    case 'gamepad-2':
      return <Gamepad2 className={className} strokeWidth={strokeWidth} />;
    case 'bookmark':
      return <Bookmark className={className} strokeWidth={strokeWidth} />;
    case 'terminal':
      return <Terminal className={className} strokeWidth={strokeWidth} />;
    case 'pen-tool':
      return <PenTool className={className} strokeWidth={strokeWidth} />;
    case 'zap':
      return <Zap className={className} strokeWidth={strokeWidth} />;
    default:
      return <Folder className={className} strokeWidth={strokeWidth} />;
  }
};

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'website';
  }
}

interface WebsiteFaviconProps {
  url: string;
  title: string;
  compact?: boolean;
}

export const WebsiteFavicon: React.FC<WebsiteFaviconProps> = ({
  url,
  title,
  compact = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const domain = extractDomain(url);
  const initial = (title.trim()[0] || domain[0] || 'W').toUpperCase();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

  return (
    <div
      className={`${
        compact ? 'w-7.5 h-7.5 rounded-lg' : 'w-10.5 h-10.5 rounded-xl'
      } bg-slate-900/90 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative transition-all duration-200`}
    >
      {!imgFailed ? (
        <img
          src={faviconUrl}
          alt={`${title} icon`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} object-contain transition-all duration-200`}
        />
      ) : (
        <span
          className={`${
            compact ? 'text-xs' : 'text-sm'
          } font-semibold accent-text font-display select-none`}
        >
          {initial}
        </span>
      )}
    </div>
  );
};

interface QuickShortcutIconProps {
  url: string;
  title: string;
  iconType: 'favicon' | 'lucide' | 'custom';
  customIcon: string;
  size?: 'sm' | 'md' | 'lg';
}

export const QuickShortcutIcon: React.FC<QuickShortcutIconProps> = ({
  url,
  title,
  iconType,
  customIcon,
  size = 'md',
}) => {
  const [customImgFailed, setCustomImgFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  // Reset error states when props change
  React.useEffect(() => {
    setCustomImgFailed(false);
    setFaviconFailed(false);
  }, [url, iconType, customIcon]);

  const domain = extractDomain(url);
  const initial = (title.trim()[0] || domain[0] || 'W').toUpperCase();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

  const sizeClass =
    size === 'lg'
      ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-2xl shadow-md'
      : size === 'sm'
      ? 'w-7 h-7 rounded-lg'
      : 'w-8 h-8 rounded-xl';
  const innerSizeClass =
    size === 'lg'
      ? 'w-6 h-6 sm:w-7 sm:h-7'
      : size === 'sm'
      ? 'w-4 h-4'
      : 'w-4.5 h-4.5';
  const fallbackTextClass =
    size === 'lg' ? 'text-base sm:text-lg' : 'text-xs';

  return (
    <div
      className={`${sizeClass} bg-slate-900/90 border border-white/12 group-hover:border-[var(--accent-primary)]/40 flex items-center justify-center shrink-0 overflow-hidden relative transition-all duration-200 group-hover:scale-105`}
    >
      {iconType === 'lucide' && customIcon ? (
        <CategoryIcon
          name={customIcon}
          categoryName={title}
          className={`${innerSizeClass} accent-text`}
          strokeWidth={2.1}
        />
      ) : iconType === 'custom' && customIcon && !customImgFailed ? (
        <img
          src={customIcon}
          alt={`${title} icon`}
          referrerPolicy="no-referrer"
          onError={() => setCustomImgFailed(true)}
          className={`${innerSizeClass} object-contain`}
        />
      ) : !faviconFailed ? (
        <img
          src={faviconUrl}
          alt={`${title} icon`}
          referrerPolicy="no-referrer"
          onError={() => setFaviconFailed(true)}
          className={`${innerSizeClass} object-contain`}
        />
      ) : (
        <span className={`${fallbackTextClass} font-bold accent-text font-display select-none`}>
          {initial}
        </span>
      )}
    </div>
  );
};



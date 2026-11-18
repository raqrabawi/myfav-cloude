import { GlassIntensity, THEME_PRESETS, ThemeMode, ThemePreset } from '../types';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return { r, g, b };
    }
  }
  return null;
}

function adjustBrightness(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const r = clamp(rgb.r + (factor > 0 ? (255 - rgb.r) * factor : rgb.r * factor));
  const g = clamp(rgb.g + (factor > 0 ? (255 - rgb.g) * factor : rgb.g * factor));
  const b = clamp(rgb.b + (factor > 0 ? (255 - rgb.b) * factor : rgb.b * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}

export function resolveThemeColors(primaryColor: string): ThemePreset {
  const preset = THEME_PRESETS.find(
    (p) => p.id === primaryColor.toLowerCase() || p.primary.toLowerCase() === primaryColor.toLowerCase()
  );
  if (preset) return preset;

  const rgb = hexToRgb(primaryColor);
  if (rgb) {
    return {
      id: 'custom',
      name: 'Custom Hue',
      primary: primaryColor,
      hover: adjustBrightness(primaryColor, -0.15),
      light: adjustBrightness(primaryColor, 0.45),
      rgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    };
  }

  return THEME_PRESETS[0]; // default Sapphire Blue
}

export function applyThemeToDom(
  primaryColor: string,
  glassIntensity: GlassIntensity,
  themeMode: ThemeMode = 'dark'
) {
  const root = document.documentElement;
  const resolved = resolveThemeColors(primaryColor);
  const isLight = themeMode === 'light';

  root.classList.toggle('light', isLight);
  root.classList.toggle('dark', !isLight);
  root.style.backgroundColor = isLight ? '#f1f5f9' : '#070b14';
  if (document.body) {
    document.body.style.backgroundColor = isLight ? '#f1f5f9' : '#070b14';
    document.body.style.color = isLight ? '#0f172a' : '#f1f5f9';
  }
  // Browser / installed-app bar colour follows the theme (Android Chrome, Safari tab bar).
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', isLight ? '#f1f5f9' : '#070b14'));

  root.style.setProperty('--accent-primary', resolved.primary);
  root.style.setProperty('--accent-hover', resolved.hover);
  // In light mode, use a deeper shade for --accent-light so highlighted text and URL badges remain high-contrast
  root.style.setProperty('--accent-light', isLight ? resolved.hover : resolved.light);
  root.style.setProperty('--accent-rgb', resolved.rgb);

  if (isLight) {
    if (glassIntensity === 'subtle') {
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.92)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(255, 255, 255, 0.97)');
      root.style.setProperty('--glass-border', 'rgba(15, 23, 42, 0.08)');
      root.style.setProperty('--glass-blur', '10px');
    } else if (glassIntensity === 'frosted') {
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.65)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(255, 255, 255, 0.84)');
      root.style.setProperty('--glass-border', 'rgba(15, 23, 42, 0.12)');
      root.style.setProperty('--glass-blur', '24px');
    } else {
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.80)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(255, 255, 255, 0.92)');
      root.style.setProperty('--glass-border', 'rgba(15, 23, 42, 0.10)');
      root.style.setProperty('--glass-blur', '16px');
    }
  } else {
    if (glassIntensity === 'subtle') {
      root.style.setProperty('--glass-bg', 'rgba(15, 23, 42, 0.78)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(19, 29, 51, 0.88)');
      root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.06)');
      root.style.setProperty('--glass-blur', '10px');
    } else if (glassIntensity === 'frosted') {
      root.style.setProperty('--glass-bg', 'rgba(15, 23, 42, 0.46)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(22, 33, 58, 0.64)');
      root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.13)');
      root.style.setProperty('--glass-blur', '24px');
    } else {
      // balanced
      root.style.setProperty('--glass-bg', 'rgba(15, 23, 42, 0.62)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(19, 29, 51, 0.78)');
      root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.09)');
      root.style.setProperty('--glass-blur', '16px');
    }
  }
}

import React, { useState } from 'react';
import myFavLogoImg from '../assets/images/myfav_app_logo_160.webp';

interface MyFavLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const MyFavLogo: React.FC<MyFavLogoProps> = ({
  size = 'md',
  showText = true,
}) => {
  const [imgError, setImgError] = useState(false);

  const badgeSize =
    size === 'sm'
      ? 'w-8 h-8 rounded-xl'
      : size === 'lg'
      ? 'w-11 h-11 rounded-2xl'
      : 'w-9 h-9 rounded-xl';

  const textSize =
    size === 'sm'
      ? 'text-base sm:text-lg'
      : size === 'lg'
      ? 'text-xl sm:text-2xl'
      : 'text-lg sm:text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none group">
      {/* Creative Glassmorphic Squircle Icon */}
      <div
        className={`relative ${badgeSize} overflow-hidden flex items-center justify-center shrink-0 bg-slate-950 border border-[var(--accent-primary)]/45 shadow-[0_0_18px_rgba(var(--accent-rgb),0.35)] group-hover:scale-105 group-hover:border-[var(--accent-light)] transition-all duration-200`}
      >
        {!imgError ? (
          <img
            src={myFavLogoImg}
            alt="MyFav Logo"
            width={160}
            height={160}
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover scale-125"
          />
        ) : (
          <svg
            viewBox="0 0 64 64"
            fill="none"
            className="w-6 h-6"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 12C18 9.79086 19.7909 8 22 8H42C44.2091 8 46 9.79086 46 12V53.5C46 55.1225 44.1782 56.0785 42.8419 55.1534L32 47.6475L21.1581 55.1534C19.8218 56.0785 18 55.1225 18 53.5V12Z"
              fill="currentColor"
              className="accent-text opacity-90"
            />
            <path
              d="M32 16L35.3 22.7L42.7 23.8L37.3 29L38.6 36.4L32 32.9L25.4 36.4L26.7 29L21.3 23.8L28.7 22.7L32 16Z"
              fill="#FFFFFF"
            />
          </svg>
        )}
        <span className="pointer-events-none absolute inset-0 rounded-inherit ring-1 ring-inset ring-white/20" />
      </div>

      {/* Creative Wordmark: MyFav */}
      {showText && (
        <div className="flex items-baseline tracking-tight font-display font-bold leading-none">
          <span className={`${textSize} text-white`}>My</span>
          <span
            className={`${textSize} accent-text drop-shadow-[0_0_12px_rgba(var(--accent-rgb),0.4)]`}
          >
            Fav
          </span>
        </div>
      )}
    </div>
  );
};

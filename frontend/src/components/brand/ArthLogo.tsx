import React from 'react';
import {
  ARTH_FULL_LOGO_VIEWBOX,
  ARTH_FULL_LOGO_PATH,
  ARTH_SYMBOL_VIEWBOX,
  ARTH_SYMBOL_PATH,
} from './logo-paths';

export interface ArthLogoProps extends React.SVGProps<SVGSVGElement> {
  /**
   * 'full': Symbol + 'Arth' wordmark (aspect ratio ~3.36:1)
   * 'symbol': Standalone geometric 'A' emblem (aspect ratio ~1.30:1)
   */
  variant?: 'full' | 'symbol';
  /**
   * 'auto': Uses currentColor (adapts automatically to light/dark text colors)
   * 'black': Explicit pure dark foreground (#18181B)
   * 'white': Explicit pure white foreground (#FAFAFA)
   */
  theme?: 'auto' | 'black' | 'white';
  /**
   * Accessible label for screen readers
   */
  title?: string;
  className?: string;
}

export function ArthLogo({
  variant = 'full',
  theme = 'auto',
  title = 'Arth',
  className = '',
  ...props
}: ArthLogoProps) {
  const isFull = variant === 'full';
  const viewBox = isFull ? ARTH_FULL_LOGO_VIEWBOX : ARTH_SYMBOL_VIEWBOX;
  const pathD = isFull ? ARTH_FULL_LOGO_PATH : ARTH_SYMBOL_PATH;

  const fill =
    theme === 'black'
      ? '#18181B'
      : theme === 'white'
        ? '#FAFAFA'
        : 'currentColor';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      fill={fill}
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 transition-colors ${className}`}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={pathD} fill={fill} />
    </svg>
  );
}

/**
 * Dedicated standalone symbol component for compact layouts and badges
 */
export function ArthSymbol(props: Omit<ArthLogoProps, 'variant'>) {
  return <ArthLogo variant="symbol" {...props} />;
}

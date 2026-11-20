import React from 'react';
import {
  SPENDSENSE_FULL_LOGO_VIEWBOX,
  SPENDSENSE_SYMBOL_VIEWBOX,
  SPENDSENSE_SYMBOL_PATH,
} from './logo-paths';

export interface ArthLogoProps extends React.SVGProps<SVGSVGElement> {
  /**
   * 'full': Symbol + 'SpendSense' wordmark (aspect ratio ~3.36:1)
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
  title = 'SpendSense',
  className = '',
  ...props
}: ArthLogoProps) {
  const isFull = variant === 'full';
  const viewBox = isFull ? SPENDSENSE_FULL_LOGO_VIEWBOX : SPENDSENSE_SYMBOL_VIEWBOX;

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
      {isFull ? (
        <>
          <path d={SPENDSENSE_SYMBOL_PATH} fill="none" stroke={fill} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 49 104 H 111" stroke="#10B981" strokeWidth="7" strokeLinecap="round" />
          <text
            x="190"
            y="108"
            fill={fill}
            fontFamily="Inter, Arial, sans-serif"
            fontSize="72"
            fontWeight="600"
            letterSpacing="-2"
          >
            SpendSense
          </text>
        </>
      ) : (
        <>
          <path d={SPENDSENSE_SYMBOL_PATH} fill="none" stroke={fill} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 49 104 H 111" stroke="#10B981" strokeWidth="7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Dedicated standalone symbol component for compact layouts and badges
 */
export function ArthSymbol(props: Omit<ArthLogoProps, 'variant'>) {
  return <ArthLogo variant="symbol" {...props} />;
}

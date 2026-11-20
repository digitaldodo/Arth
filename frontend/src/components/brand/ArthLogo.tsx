import React from 'react';
import {
  SPENDSENSE_FULL_LOGO_VIEWBOX,
  SPENDSENSE_SYMBOL_VIEWBOX,
  SPENDSENSE_SYMBOL_PATH,
  SPENDSENSE_PAGE_PATH,
  SPENDSENSE_PAGE_FOLD_PATH,
} from './logo-paths';

export interface ArthLogoProps extends React.SVGProps<SVGSVGElement> {
  /** 'full': ledger symbol and SpendSense wordmark; 'symbol': standalone mark. */
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
      <g>
        <rect x="0" y="0" width="160" height="160" rx="34" fill="#193F37" />
        <path d={SPENDSENSE_PAGE_PATH} fill="#F6F4ED" />
        <path d={SPENDSENSE_PAGE_FOLD_PATH} fill="none" stroke="#D9E2D9" strokeWidth="3" strokeLinejoin="round" />
        <path d={SPENDSENSE_SYMBOL_PATH} fill="none" stroke="#193F37" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 94 128 H 111" stroke="#B67645" strokeWidth="5" strokeLinecap="round" />
      </g>
      {isFull && (
        <text
          x="184"
          y="106"
          fill={fill}
          fontFamily="Inter, Arial, sans-serif"
          fontSize="63"
          fontWeight="600"
          letterSpacing="-1.8"
        >
          SpendSense
        </text>
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

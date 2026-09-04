/**
 * BranchPort POS Icon System
 *
 * Simplified icon set for the branch staff POS app.
 * Icons are large, clear, and designed for quick tapping.
 */

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// ═══════════════════════════════════════════════════════════════════════
// ADINKRA — simple version for POS
// ═══════════════════════════════════════════════════════════════════════

/** Aya — fern / endurance. Used for stock/inventory. */
export function AdinkraStock({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v18" />
      <path d="M8 7l4 2 4-2" />
      <path d="M7 11l5 2 5-2" />
      <path d="M8 15l4 2 4-2" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// POS NAVIGATION ICONS — large, clear, tap-friendly
// ═══════════════════════════════════════════════════════════════════════

/** Cart icon — Sell / POS */
export function IconCart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  );
}

/** Box icon — Stock / Inventory */
export function IconBox({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8V21H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M12 12v9" />
      <path d="M12 12l8-4" />
      <path d="M12 12L4 8" />
    </svg>
  );
}

/** Receipt icon — Invoices */
export function IconReceipt({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2L4 2z" />
      <path d="M8 10h8" />
      <path d="M8 14h4" />
    </svg>
  );
}

/** Chart icon — Dashboard / Balance */
export function IconChart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

/** Currency / money icon */
export function IconCurrency({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M13.5 10.5c-.5-.5-1.5-.5-1.5 0s1 0.5 1.5 1 1.5 1 1.5 0-1-.5-1.5-1z" />
    </svg>
  );
}

/** Search icon */
export function IconSearch({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/** Phone icon */
export function IconPhone({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M12 18h.01" />
    </svg>
  );
}

/** Link / activation icon */
export function IconLink({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Signal / connectivity indicator */
export function IconSignal({ size = 24, online = true, ...props }: IconProps & { online?: boolean }) {
  const color = online ? '#22c55e' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="4" fill={color} opacity="0.3" />
      <circle cx="12" cy="12" r="2" fill={color} />
    </svg>
  );
}

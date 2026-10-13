/**
 * BranchPort POS Icon System
 *
 * Custom vector-drawn icons for the till's AssistiveTouch menu.
 * Each icon is designed to be instantly recognisable at a glance —
 * a shopfront for Sell, stacked crates for Stock, a stamped document
 * for Invoices, and so on — so a cashier never has to read the label
 * to find the right button.
 */

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// ═══════════════════════════════════════════════════════════════════════
// SELL — a shopfront with a striped awning
// ═══════════════════════════════════════════════════════════════════════
export function IconCart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Awning — scalloped edge */}
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2" />
      {/* Shop body */}
      <path d="M4 11v9a1 1 0 001 1h14a1 1 0 001-1v-9" />
      {/* Door */}
      <path d="M10 21v-5a2 2 0 014 0v5" />
      {/* Window */}
      <rect x="6" y="13" width="3" height="3" rx="0.5" />
      <rect x="15" y="13" width="3" height="3" rx="0.5" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STOCK — stacked crates / warehouse boxes
// ═══════════════════════════════════════════════════════════════════════
export function IconBox({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Back crate (top) */}
      <rect x="7" y="2" width="10" height="7" rx="1" />
      <path d="M7 5h10" />
      <path d="M12 2v7" />
      {/* Front crate (bottom-left) */}
      <rect x="2" y="11" width="10" height="7" rx="1" />
      <path d="M2 14h10" />
      <path d="M7 11v7" />
      {/* Front crate (bottom-right) */}
      <rect x="12" y="11" width="10" height="7" rx="1" />
      <path d="M12 14h10" />
      <path d="M17 11v7" />
      {/* Floor shadow */}
      <path d="M4 21h16" opacity="0.4" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INVOICES — a document with a wax-stamp seal
// ═══════════════════════════════════════════════════════════════════════
export function IconReceipt({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Document with torn bottom edge */}
      <path d="M5 2h10l4 4v14a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M15 2v4h4" />
      {/* Text lines */}
      <path d="M8 10h8" />
      <path d="M8 13h6" />
      <path d="M8 16h4" />
      {/* Wax seal — circle with inner star */}
      <circle cx="17" cy="17" r="3.5" fill="currentColor" opacity="0.15" />
      <circle cx="17" cy="17" r="3.5" />
      <path d="M17 15.5l.5 1 1 .2-.8.7.3 1-.9-.5-.9.5.3-1-.8-.7 1-.2z" fill="currentColor" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DEBTORS — two figures with a coin between them
// ═══════════════════════════════════════════════════════════════════════
export function IconDebtors({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Left person */}
      <circle cx="7" cy="6" r="3" />
      <path d="M2 21v-2a5 5 0 015-5 5 5 0 015 5v2" />
      {/* Right person */}
      <circle cx="17" cy="6" r="3" />
      <path d="M12 21v-2a5 5 0 015-5" />
      <path d="M22 21v-2a5 5 0 00-3-4.58" />
      {/* Coin between them */}
      <circle cx="12" cy="14" r="2.5" />
      <path d="M12 12.5v3" opacity="0.6" />
      <path d="M11 13.2c.3-.3.7-.4 1-.4.8 0 1.2.4 1.2 1s-.4 1-1.2 1c-.3 0-.7-.1-1-.4" opacity="0.6" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BALANCE — a bank vault door
// ═══════════════════════════════════════════════════════════════════════
export function IconChart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Vault door */}
      <rect x="3" y="2" width="18" height="20" rx="2" />
      <rect x="6" y="5" width="12" height="14" rx="1" />
      {/* Dial / handle */}
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      {/* Handle spokes */}
      <path d="M12 9V7" />
      <path d="M12 15v2" />
      <path d="M9 12H7" />
      <path d="M15 12h2" />
      {/* Hinge */}
      <path d="M3 8h-1" />
      <path d="M3 16h-1" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CALCULATOR — a calculator with display and buttons
// ═══════════════════════════════════════════════════════════════════════
export function IconCalculator({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Body */}
      <rect x="4" y="1" width="16" height="22" rx="2" />
      {/* Display */}
      <rect x="6" y="3" width="12" height="5" rx="1" />
      {/* Display content — right-aligned number feel */}
      <path d="M14 5.5h2" strokeWidth="2" />
      {/* Buttons — 3×3 grid */}
      <circle cx="8" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" />
      <circle cx="8" cy="15.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="15.5" r="0.8" fill="currentColor" />
      <circle cx="16" cy="15.5" r="0.8" fill="currentColor" />
      <circle cx="8" cy="19" r="0.8" fill="currentColor" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" />
      {/* Equals key — wider */}
      <rect x="14.5" y="18" width="3" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SYNC — circular arrows with a cloud
// ═══════════════════════════════════════════════════════════════════════
export function IconSync({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Cloud in the centre */}
      <path d="M7 16a4 4 0 01-.5-7.97A5.5 5.5 0 0117.5 9 3.5 3.5 0 0117 16" fill="currentColor" opacity="0.12" />
      <path d="M7 16a4 4 0 01-.5-7.97A5.5 5.5 0 0117.5 9 3.5 3.5 0 0117 16" />
      {/* Sync arrow — top-right arc */}
      <path d="M19 14a7 7 0 01-7 7" />
      <path d="M19 14l-2 2 2 2" fill="none" />
      {/* Sync arrow — bottom-left arc */}
      <path d="M5 10a7 7 0 017-7" />
      <path d="M5 10l2-2-2-2" fill="none" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY ICONS — used inside pages
// ═══════════════════════════════════════════════════════════════════════

/** Currency / money — cedi note */
export function IconCurrency({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="6" width="22" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      {/* Cedi symbol stylised inside */}
      <path d="M14 10.5c-.6-.6-1.6-.6-1.6.5s1.1.5 1.6 1 1.6 1 1.6 0-1.1-.5-1.6-1z" />
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

// ═══════════════════════════════════════════════════════════════════════
// WAITLIST — a clipboard with a clock, for queued customer orders
// ═══════════════════════════════════════════════════════════════════════
export function IconWaitlist({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Clipboard body */}
      <rect x="4" y="4" width="16" height="18" rx="2" />
      {/* Clipboard clip */}
      <rect x="8" y="1" width="8" height="5" rx="1" />
      {/* Clock face — bottom-right corner */}
      <circle cx="16" cy="16" r="4" fill="currentColor" opacity="0.12" />
      <circle cx="16" cy="16" r="4" />
      <path d="M16 14v2.5l1.5 1" />
      {/* Checklist lines */}
      <path d="M8 10h4" />
      <path d="M8 14h3" />
    </svg>
  );
}

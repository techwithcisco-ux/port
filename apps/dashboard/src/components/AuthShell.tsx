import { ReactNode } from 'react';
import { Adinkrahene, Aya, GyeNyame, GhanaFlagStripe, KentePattern, Nsoromma, Sankofa } from './AdinkraSymbols';

// Shared frame for every screen a user hits before they reach an app:
// sign in, sign up, the POS-first greeting and the staff notice. Each of
// those used to hand-roll its own centered card, so they drifted apart.
// The left rail carries the Ghana cultural identity; the right column is
// the cream content area that hosts the screen's own card.
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Cultural rail (desktop) ─────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col">
        <KentePattern
          width={280}
          height={280}
          opacity={0.06}
          className="pointer-events-none absolute -right-20 -top-20"
        />

        <div className="relative flex items-center gap-3 px-10 pt-9">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ghana-gold shadow-gold">
            <GyeNyame size={30} color="#1A1A2E" />
          </div>
          <div>
            <p className="text-[17px] font-bold tracking-tight">BranchPort</p>
            <p className="text-[11px] font-medium tracking-wide text-gray-400">
              Multi-branch retail, made simple
            </p>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col justify-center px-10 py-12">
          {aside ?? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                Built for the market
              </p>
              <h2 className="mt-4 max-w-md text-[2.1rem] font-bold leading-[1.12] tracking-[-0.03em] text-white">
                Sales, stock and credit,
                <span className="text-ghana-gold"> from the first sale.</span>
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
                One account reaches every branch, every till and every supplier — online or
                offline, on the phone already in your hand.
              </p>
            </>
          )}
        </div>

        <div className="relative grid grid-cols-3 gap-3 px-10 pb-6">
          {[
            { Icon: Sankofa, name: 'Sankofa', meaning: 'Learn from what came before' },
            { Icon: Aya, name: 'Aya', meaning: 'Endurance and resourcefulness' },
            { Icon: Adinkrahene, name: 'Adinkrahene', meaning: 'Leadership and initiative' },
          ].map(({ Icon, name, meaning }) => (
            <div
              key={name}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3.5 transition-colors hover:border-ghana-gold/40 hover:bg-white/[0.07]"
            >
              <Icon size={22} color="#FCD116" />
              <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-white">{name}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-white/45">{meaning}</p>
            </div>
          ))}
        </div>

        <GhanaFlagStripe width="100%" height={7} showStar className="relative" />
      </aside>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col">
        {/* Compact brand band — replaces the rail on small screens */}
        <header className="bg-ink lg:hidden">
          <div className="ghana-stripe">
            <div className="red" />
            <div className="gold" />
            <div className="green" />
          </div>
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ghana-gold">
              <GyeNyame size={20} color="#1A1A2E" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">BranchPort</p>
              <p className="mt-1 text-[10px] font-medium tracking-wide text-gray-400">
                Retail, made simple
              </p>
            </div>
            <Nsoromma size={18} color="rgba(255,255,255,0.25)" className="ml-auto" />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          <div className="w-full max-w-md">
            <div className="page-enter mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                {eyebrow}
              </p>
              <h1 className="mt-2 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em] text-ink">
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 text-[15px] text-ink-mute">{subtitle}</p>}
            </div>

            <div className="card card-enter p-6 sm:p-7">{children}</div>

            {footer && <div className="mt-5 text-center">{footer}</div>}
          </div>
        </main>

        <footer className="px-5 pb-6 text-center lg:hidden">
          <GhanaFlagStripe width={140} height={5} showStar />
          <p className="mt-3 text-[11px] text-ink-faint">
            Sales · Stock · Supplier credit — built for the Ghanaian market
          </p>
        </footer>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'star' | 'text' | 'fade'>('star');

  useEffect(() => {
    // Phase 1: Star appears (0ms)
    // Phase 2: Text appears (600ms)
    // Phase 3: Fade out (1800ms)
    const t1 = setTimeout(() => setPhase('text'), 600);
    const t2 = setTimeout(() => setPhase('fade'), 1800);
    const t3 = setTimeout(onComplete, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div
      className="splash-screen"
      style={{
        opacity: phase === 'fade' ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
      }}
    >
      {/* Background with subtle pattern */}
      <div className="splash-bg" />

      {/* Center content */}
      <div className="splash-content">
        {/* Ghana flag stripe — animates in first */}
        <div className="splash-stripe">
          <div className="splash-stripe-red" />
          <div className="splash-stripe-gold" />
          <div className="splash-stripe-green" />
        </div>

        {/* Black Star — spins in with 3D effect */}
        <div className={`splash-star ${phase !== 'star' ? 'splash-star-visible' : ''}`}>
          <svg width="80" height="80" viewBox="0 0 100 100" aria-hidden>
            {(() => {
              const points: [number, number][] = [];
              for (let i = 0; i < 10; i++) {
                const angle = Math.PI / 2 + (i * Math.PI) / 5;
                const r = i % 2 === 0 ? 44 : 18;
                points.push([50 + r * Math.cos(angle), 50 - r * Math.sin(angle)]);
              }
              const starPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
              return <path d={starPath} fill="#FCD116" />;
            })()}
          </svg>
        </div>

        {/* App name — slides up after star */}
        <div className={`splash-text ${phase !== 'star' ? 'splash-text-visible' : ''}`}>
          <h1 className="splash-title">BranchPort</h1>
          <p className="splash-subtitle">Every branch. One honest record.</p>
        </div>

        {/* Loading bar */}
        <div className={`splash-bar-container ${phase !== 'star' ? 'splash-bar-visible' : ''}`}>
          <div className="splash-bar" />
        </div>
      </div>
    </div>
  );
}

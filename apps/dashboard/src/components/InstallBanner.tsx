import { useEffect, useState } from 'react';

/**
 * PWA install banner.
 *
 * - Android / Chrome / Edge  → captures beforeinstallprompt, shows "Install" button
 * - iOS Safari               → shows manual "Share → Add to Home Screen" instructions
 * - Desktop browsers          → shows "Download App" button
 * - Already installed         → hides itself
 */
export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session or already installed
    if (sessionStorage.getItem('branchport-install-dismissed')) {
      setDismissed(true);
      return;
    }

    // Check if running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as any).standalone === true) return;

    // Capture the install prompt (Android Chrome, Edge, etc.)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari doesn't fire beforeinstallprompt — detect manually
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowBanner(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Android / Chrome — native install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowBanner(false);
      setDeferredPrompt(null);
    } else {
      // iOS / other — show manual instructions
      setShowInstructions(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    sessionStorage.setItem('branchport-install-dismissed', '1');
  };

  if (dismissed || !showBanner) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className="mx-3 mb-3">
      <div
        className="rounded-xl p-3 border"
        style={{
          background: 'linear-gradient(135deg, rgba(252,209,22,0.1) 0%, rgba(0,107,63,0.08) 100%)',
          borderColor: 'var(--ghana-gold)',
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📱</span>
            <p className="text-xs font-bold" style={{ color: 'var(--ghana-black)' }}>
              Install BranchPort
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="h-5 w-5 rounded-full grid place-items-center text-gray-400 hover:text-gray-600 text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="text-[11px] text-gray-600 mb-2 leading-relaxed">
          {isMobile
            ? 'Add BranchPort to your home screen — works like a real app!'
            : 'Download BranchPort to your computer for quick access.'}
        </p>

        {/* Install button */}
        {!showInstructions ? (
          <button
            onClick={handleInstall}
            className="w-full rounded-lg py-2 text-xs font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--ghana-green)' }}
          >
            {deferredPrompt ? '📲 Install Now' : isIOS ? '📲 How to Install' : '⬇️ Download App'}
          </button>
        ) : (
          /* iOS manual instructions */
          <div className="rounded-lg p-3 mt-1" style={{ background: 'rgba(0,0,0,0.04)' }}>
            <p className="text-[11px] font-semibold text-gray-700 mb-2">
              To install on iPhone:
            </p>
            <ol className="text-[11px] text-gray-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Tap the <span className="font-bold">Share</span> button{' '}
                <span className="inline-block px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">⬆️</span> at the
                bottom
              </li>
              <li>
                Scroll down and tap{' '}
                <span className="font-bold">"Add to Home Screen"</span>
              </li>
              <li>Tap <span className="font-bold">Add</span> in the top right</li>
            </ol>
            <p className="text-[10px] text-gray-400 mt-2 italic">
              BranchPort will appear on your home screen like a real app!
            </p>
          </div>
        )}

        {/* Offline badge */}
        <p className="text-[10px] text-center mt-2" style={{ color: 'var(--ghana-gold)' }}>
          ★ Works offline · Fast loading · No data waste
        </p>
      </div>
    </div>
  );
}

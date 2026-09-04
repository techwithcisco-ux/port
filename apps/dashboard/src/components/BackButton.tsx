import { useNavigate } from 'react-router-dom';

export default function BackButton({ to, label }: { to?: string; label?: string }) {
  const navigate = useNavigate();

  function handleClick() {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4 -ml-1"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label ?? 'Back'}
    </button>
  );
}

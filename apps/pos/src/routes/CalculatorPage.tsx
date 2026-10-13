import Calculator from '../components/Calculator';
import { useNavigate } from 'react-router-dom';

// Full-screen calculator for the till — quick quantity/price maths
// without leaving the POS app. Reachable from the AssistiveTouch menu.
export default function CalculatorPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calculator</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quick maths at the counter</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 active:scale-95"
        >
          Back
        </button>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-sm">
          <Calculator />
        </div>
      </div>
    </div>
  );
}

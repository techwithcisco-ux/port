import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Shop from './routes/Shop';

// Public storefront: no login. Every page is scoped to a waitlist invite
// token (?/w/:token) issued by the shop to a customer phone number.
const base = import.meta.env.BASE_URL || '/';
const routerBasename = base !== '/' ? base.replace(/\/$/, '') : undefined;

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <Routes>
        <Route path="/w/:token" element={<Shop />} />
        <Route path="*" element={<BadLink />} />
      </Routes>
    </BrowserRouter>
  );
}

function BadLink() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-gray-200/80 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gray-900">
          <span className="text-xl font-black leading-none text-amber-300">★</span>
        </div>
        <h1 className="text-lg font-bold tracking-tight text-gray-900">Shop link missing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Open the full link your shop sent you on WhatsApp — it ends with a long code after <span className="font-mono">/w/</span>.
        </p>
      </div>
    </div>
  );
}

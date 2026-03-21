import { Link } from 'react-router-dom';
import { Home, Zap } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="text-center text-white">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-white/10 items-center justify-center mb-6">
          <Zap className="w-8 h-8 text-white" fill="currentColor" />
        </div>
        <div className="text-8xl font-black mb-4 text-brand-300">404</div>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-brand-300 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <Link
          to="/drive/my-drive"
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-900 text-sm font-semibold rounded-xl hover:bg-brand-50 transition-colors"
        >
          <Home className="w-4 h-4" />
          Go to My Drive
        </Link>
      </div>
    </div>
  );
}

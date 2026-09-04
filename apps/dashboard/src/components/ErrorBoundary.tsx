import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClearData = () => {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('branchport')) localStorage.removeItem(k);
    }
    sessionStorage.clear();
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--cream)' }}>
          <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-lg">
            <div className="ghana-stripe">
              <div className="red" />
              <div className="gold" />
              <div className="green" />
            </div>
            <div className="p-6 sm:p-8 text-center">
              <div className="text-5xl mb-4">🚨</div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h1>
              <p className="text-sm text-gray-500 mb-1">
                A problem occurred while loading this page.
              </p>
              <p className="text-xs text-gray-400 mb-6 font-mono break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>

              <div className="space-y-3">
                <button
                  onClick={this.handleReset}
                  className="btn btn-primary w-full"
                  style={{ background: 'var(--ghana-green)' }}
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleClearData}
                  className="btn btn-outline w-full text-red-600 border-red-200 hover:bg-red-50"
                >
                  Clear Data & Start Fresh
                </button>
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full text-sm text-gray-500 hover:text-gray-900 py-2"
                >
                  Go to Home
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

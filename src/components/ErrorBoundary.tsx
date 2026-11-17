import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      let parsedError: { error?: string; operationType?: string; path?: string } | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen accent-glow-bg text-slate-100 flex items-center justify-center p-6">
          <div className="glass-elevated max-w-lg w-full rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-100">
                Workspace Synchronization Notice
              </h2>
            </div>

            {parsedError && parsedError.error ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p>
                  A database operation ({parsedError.operationType || 'request'} on{' '}
                  <span className="font-mono-tabular text-slate-200">{parsedError.path || 'collection'}</span>)
                  could not be completed:
                </p>
                <p className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 font-mono-tabular text-xs text-rose-300 break-words">
                  {parsedError.error}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-300 break-words">{this.state.errorMessage}</p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl accent-bg text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Resume Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

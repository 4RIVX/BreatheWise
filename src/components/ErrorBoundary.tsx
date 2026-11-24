import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unexpected application error.",
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
        >
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h1 className="text-lg font-semibold text-slate-900">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-600">
              BreatheWise encountered an unexpected issue while syncing data.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              Reload BreatheWise
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

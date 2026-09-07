// A reusable error boundary — there were zero in this app before this pass,
// meaning one unhandled render error white-screened the entire thing.
// Reuses EmptyState's calm, on-brand visual language rather than inventing a
// second "something went wrong" style. Must be a class component — React has
// no hook equivalent for componentDidCatch/getDerivedStateFromError.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Short label identifying which part of the page this guards, shown in
   * the fallback so a failure reads as "this panel broke," not "the app broke" —
   * e.g. "plot map," "admin dashboard," "checkout." */
  section?: string;
  /** Rendered instead of the default fallback, when a caller wants a more
   * specific recovery UI for this particular boundary. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO (backend): send this to a real error-reporting sink (Sentry or
    // equivalent) once one exists — console.error is a placeholder, not a
    // monitoring strategy.
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ""}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="text-center py-16 px-6">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--muted)] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--muted-foreground)]">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z" />
          </svg>
        </div>
        <div className="text-sm font-medium text-[var(--foreground)] mb-1">
          {this.props.section ? `Something went wrong loading ${this.props.section}` : "Something went wrong"}
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mb-4 max-w-sm mx-auto">
          The rest of the page should still work. Try again, or head back home if it keeps happening.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={this.reset} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Try again
          </button>
          <Link to="/" className="px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
            Go home
          </Link>
        </div>
      </div>
    );
  }
}

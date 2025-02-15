import React, { Component, ErrorInfo } from 'react';
import { toast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      type: error.name
    });

    this.setState({
      error,
      errorInfo
    });

    toast({
      title: "An error occurred",
      description: "We've logged the error and are working to fix it.",
      variant: "destructive",
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{this.state.error?.message}</p>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-2 p-4 bg-background/50 rounded overflow-auto text-xs">
                {this.state.error?.stack}
              </pre>
            )}
          </div>
          <Button 
            variant="destructive"
            onClick={() => window.location.reload()}
            className="w-full justify-center"
          >
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
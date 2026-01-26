'use client';

import { AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorAlert({ message, onRetry, className }: ErrorAlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 bg-no/10 border border-no/30 rounded-lg',
        className
      )}
      role="alert"
    >
      <AlertOctagon className="w-5 h-5 text-no flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-no font-medium">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-no hover:text-no/80 text-sm font-medium underline"
          aria-label="Retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}

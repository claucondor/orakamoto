'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessToastProps {
  message: string;
  onClose?: () => void;
  duration?: number;
  className?: string;
}

export default function SuccessToast({
  message,
  onClose,
  duration = 3000,
  className,
}: SuccessToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setIsAnimating(false), 10);

    // Auto-dismiss
    const dismissTimer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration]);

  const handleClose = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 200); // Match exit animation duration
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-yes/10 border border-yes/30 rounded-lg shadow-lg',
        'transition-all duration-200',
        isAnimating ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <CheckCircle className="w-5 h-5 text-yes flex-shrink-0" />
      <p className="text-yes font-medium flex-1">{message}</p>
      <button
        onClick={handleClose}
        className="text-yes hover:text-yes/80 transition-colors"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

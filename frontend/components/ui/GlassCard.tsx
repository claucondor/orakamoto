'use client';

import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function GlassCard({ children, className, hover = false }: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6',
        'transition-all duration-200',
        hover && 'hover:bg-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-white/5',
        className
      )}
    >
      {children}
    </div>
  );
}

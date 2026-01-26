'use client';

import { CheckCircle2, Clock, Sparkle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'active' | 'resolved' | 'ended' | 'new';

interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const badgeConfig = {
  active: {
    borderColor: '#00FF41',
    color: '#00FF41',
    label: 'ACTIVE',
    icon: CheckCircle2,
    textColor: 'text-matrix-green',
    borderColorClass: 'border-matrix-green',
  },
  resolved: {
    borderColor: '#5546FF',
    color: '#5546FF',
    label: 'RESOLVED',
    icon: CheckCircle2,
    textColor: 'text-brand-secondary',
    borderColorClass: 'border-brand-secondary',
  },
  ended: {
    borderColor: '#F59E0B',
    color: '#F59E0B',
    label: 'ENDED',
    icon: Clock,
    textColor: 'text-cyber-yellow',
    borderColorClass: 'border-cyber-yellow',
  },
  new: {
    borderColor: '#00F7FF',
    color: '#00F7FF',
    label: 'NEW',
    icon: Sparkle,
    textColor: 'text-cyber-cyan',
    borderColorClass: 'border-cyber-cyan',
  },
};

const sizeClasses = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-base gap-2',
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export default function Badge({
  variant,
  children,
  className,
  size = 'md',
}: BadgeProps) {
  const config = badgeConfig[variant];
  const Icon = config.icon;
  const sizeClass = sizeClasses[size];
  const iconSize = iconSizes[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-bold uppercase tracking-wider border-2',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        config.textColor,
        config.borderColorClass,
        sizeClass,
        className
      )}
    >
      {variant === 'active' && (
        <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse bg-matrix-green', iconSize)} />
      )}
      {variant !== 'active' && <Icon className={cn(iconSize, config.textColor)} />}
      {children || config.label}
    </span>
  );
}

// Convenience exports
export function ActiveBadge(props: Omit<BadgeProps, 'variant'>) {
  return <Badge variant="active" {...props} />;
}

export function ResolvedBadge(props: Omit<BadgeProps, 'variant'>) {
  return <Badge variant="resolved" {...props} />;
}

export function EndedBadge(props: Omit<BadgeProps, 'variant'>) {
  return <Badge variant="ended" {...props} />;
}

export function NewBadge(props: Omit<BadgeProps, 'variant'>) {
  return <Badge variant="new" {...props} />;
}

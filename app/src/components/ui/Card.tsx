'use client';

import Link from 'next/link';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'glass';

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white border border-gray-200',
  elevated: 'bg-white border border-gray-200 shadow-lg hover:shadow-xl',
  bordered: 'bg-white border-2 border-shield/20 hover:border-shield/40',
  glass: 'bg-white/80 backdrop-blur-sm border border-white/20',
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Card({
  variant = 'default',
  className = '',
  children,
  href,
  onClick,
  padding = 'md',
}: CardProps) {
  const baseStyles = `rounded-xl transition-all duration-200`;
  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={`block ${combinedClassName} hover:scale-[1.02]`}
      >
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left ${combinedClassName} hover:scale-[1.02]`}
      >
        {children}
      </button>
    );
  }

  return <div className={combinedClassName}>{children}</div>;
}

// Card Header component
export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-shield/10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// Card Section for themed content blocks
export function CardSection({
  title,
  children,
  headerColor = 'shield',
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  headerColor?: 'shield' | 'oak' | 'amber';
  className?: string;
}) {
  const headerColors = {
    shield: 'bg-shield',
    oak: 'bg-oak',
    amber: 'bg-amber-600',
  };

  return (
    <div
      className={`rounded-xl overflow-hidden border border-gray-200 ${className}`}
    >
      <div className={`${headerColors[headerColor]} px-4 py-2`}>
        <h3 className="text-amber-400 text-sm font-medium uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}

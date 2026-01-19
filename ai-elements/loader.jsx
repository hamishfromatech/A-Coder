import React, { useMemo, memo } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

export const Loader = React.forwardRef(({ 
  className,
  size = 'default',
  variant = 'default',
  ...props 
}, ref) => {
  const sizes = {
    sm: 'w-4 h-4',
    default: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const variants = {
    default: 'text-primary',
    secondary: 'text-secondary',
    muted: 'text-muted-foreground'
  };

  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex',
        sizes[size],
        variants[variant],
        'animate-spin',
        className
      )}
      {...props}
    >
      <Icon name="loader" className="w-full h-full" />
    </div>
  );
});
Loader.displayName = 'Loader';

export const LoaderDots = React.forwardRef(({ 
  className,
  size = 'default',
  ...props 
}, ref) => {
  const sizes = {
    sm: 'w-1 h-1',
    default: 'w-1.5 h-1.5',
    lg: 'w-2 h-2'
  };

  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-1', className)}
      {...props}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            sizes[size],
            'rounded-full bg-primary animate-pulse'
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
});
LoaderDots.displayName = 'LoaderDots';

export const LoadingMessage = React.forwardRef(({ 
  className,
  message = 'Loading...',
  showDots = true,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        className
      )}
      {...props}
    >
      {showDots && <LoaderDots />}
      <span>{message}</span>
    </div>
  );
});
LoadingMessage.displayName = 'LoadingMessage';

export const Skeleton = React.forwardRef(({ 
  className,
  variant = 'default',
  ...props 
}, ref) => {
  const variants = {
    default: 'h-4 w-full',
    text: 'h-4 w-3/4',
    title: 'h-8 w-1/2',
    avatar: 'h-10 w-10 rounded-full',
    button: 'h-10 w-24 rounded-md',
    input: 'h-10 w-full rounded-md',
    card: 'h-32 w-full rounded-lg'
  };

  return (
    <div
      ref={ref}
      className={cn(
        'animate-pulse rounded-md bg-muted',
        variants[variant],
        className
      )}
      {...props}
    />
  );
});
Skeleton.displayName = 'Skeleton';

// Shimmer component - animated shimmer effect for text
const ShimmerComponent = React.forwardRef(({ 
  as: Component = 'p',
  children,
  className,
  duration = 2,
  spread = 2,
  ...props 
}, ref) => {
  const shimmerStyle = useMemo(() => {
    const textLength = String(children).length;
    const shimmerSpread = Math.max(textLength * spread, 100); // Minimum 100px spread
    
    return {
      '--shimmer-duration': `${duration}s`,
      '--shimmer-spread': `${shimmerSpread}px`,
    };
  }, [children, duration, spread]);

  return (
    <>
      <ShimmerGlobalStyles />
      <Component
        ref={ref}
        className={cn('shimmer-text', className)}
        style={shimmerStyle}
        {...props}
      >
        {children}
      </Component>
    </>
  );
});
ShimmerComponent.displayName = 'Shimmer';

// Memoized version for performance
export const Shimmer = memo(ShimmerComponent);

// Global styles for shimmer effect
function ShimmerGlobalStyles() {
  return (
    <style jsx global>{`
      .shimmer-text {
        background: linear-gradient(
          90deg,
          hsl(var(--foreground)) 0%,
          hsl(var(--muted-foreground)) 50%,
          hsl(var(--foreground)) 100%
        );
        background-size: 200%;
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer var(--shimmer-duration, 2s) linear infinite;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% center;
        }
        100% {
          background-position: -200% center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .shimmer-text {
          animation: none;
          -webkit-text-fill-color: hsl(var(--foreground));
        }
      }
    `}</style>
  );
}
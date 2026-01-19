import React from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ConnectionStatus = React.forwardRef(({ 
  className,
  isConnected = false,
  label,
  onReconnect,
  isLoading = false,
  variant = 'default',
  ...props 
}, ref) => {
  const variants = {
    default: 'flex items-center gap-2',
    compact: 'flex items-center gap-1',
    dot: 'flex items-center gap-2'
  };

  const getStatusColor = () => {
    if (isLoading) return 'text-yellow-500';
    if (isConnected) return 'text-green-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (isLoading) return 'loader';
    if (isConnected) return 'checkCircle';
    return 'alertCircle';
  };

  if (variant === 'dot') {
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-2', className)}
        {...props}
      >
        <div className={cn(
          'w-2 h-2 rounded-full',
          isLoading && 'bg-yellow-500 animate-pulse',
          isConnected && 'bg-green-500',
          !isConnected && !isLoading && 'bg-red-500'
        )} />
        <span className="text-xs font-medium">
          {label || (isConnected ? 'Connected' : 'Disconnected')}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(variants[variant], className)}
      {...props}
    >
      {variant === 'default' || variant === 'compact' ? (
        <>
          <Icon 
            name={getStatusIcon()} 
            size={variant === 'compact' ? 14 : 16} 
            className={cn(
              getStatusColor(),
              isLoading && 'animate-spin'
            )}
          />
          <span className={cn(
            'font-medium',
            variant === 'compact' ? 'text-xs' : 'text-sm',
            isLoading && 'text-yellow-500',
            isConnected && 'text-green-500',
            !isConnected && !isLoading && 'text-red-500'
          )}>
            {label || (isConnected ? 'Connected' : 'Disconnected')}
          </span>
        </>
      ) : null}
      {onReconnect && !isConnected && !isLoading && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          className={cn(
            'h-6 px-2',
            variant === 'compact' && 'text-xs'
          )}
        >
          Reconnect
        </Button>
      )}
    </div>
  );
});
ConnectionStatus.displayName = 'ConnectionStatus';

export const ConnectionControls = React.forwardRef(({ 
  className,
  status = 'idle',
  onStop,
  onRetry,
  isLoading = false,
  ...props 
}, ref) => {
  const statusConfig = {
    idle: {
      icon: 'circle',
      color: 'text-muted-foreground',
      label: 'Idle'
    },
    connecting: {
      icon: 'loader',
      color: 'text-yellow-500 animate-spin',
      label: 'Connecting...'
    },
    connected: {
      icon: 'checkCircle',
      color: 'text-green-500',
      label: 'Connected'
    },
    error: {
      icon: 'alertCircle',
      color: 'text-red-500',
      label: 'Error'
    }
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      <Icon name={config.icon} size={16} className={config.color} />
      <span className="text-sm font-medium">{config.label}</span>
      
      {status === 'connected' && onStop && (
        <Button
          variant="outline"
          size="sm"
          onClick={onStop}
          className="ml-2"
        >
          <Icon name="square" size={12} className="mr-1" />
          Stop
        </Button>
      )}

      {status === 'error' && onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="ml-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <Icon name="loader" size={12} className="animate-spin mr-1" />
          ) : (
            <Icon name="refresh" size={12} className="mr-1" />
          )}
          Retry
        </Button>
      )}
    </div>
  );
});
ConnectionControls.displayName = 'ConnectionControls';

export const ConnectionBadge = React.forwardRef(({ 
  className,
  type = 'api',
  isConnected = false,
  label,
  count,
  ...props 
}, ref) => {
  const typeConfig = {
    api: {
      icon: 'server',
      bgColor: isConnected ? 'bg-blue-500/10' : 'bg-red-500/10',
      borderColor: isConnected ? 'border-blue-500/30' : 'border-red-500/30',
      textColor: isConnected ? 'text-blue-500' : 'text-red-500'
    },
    backend: {
      icon: 'hardDrive',
      bgColor: isConnected ? 'bg-green-500/10' : 'bg-red-500/10',
      borderColor: isConnected ? 'border-green-500/30' : 'border-red-500/30',
      textColor: isConnected ? 'text-green-500' : 'text-red-500'
    },
    mcp: {
      icon: 'layers',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      textColor: 'text-purple-500'
    }
  };

  const config = typeConfig[type] || typeConfig.api;

  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-md border',
        config.bgColor,
        config.borderColor,
        className
      )}
      {...props}
    >
      <Icon 
        name={config.icon} 
        size={14} 
        className={config.textColor} 
      />
      <span className="text-xs font-medium">
        {label}
      </span>
      {count !== undefined && (
        <span className={cn('text-xs', config.textColor)}>
          ({count})
        </span>
      )}
      <div className={cn(
        'w-1.5 h-1.5 rounded-full',
        isConnected ? 'bg-green-500' : 'bg-red-500',
        !isConnected && 'animate-pulse'
      )} />
    </div>
  );
});
ConnectionBadge.displayName = 'ConnectionBadge';
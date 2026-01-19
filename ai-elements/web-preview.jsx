import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Context for WebPreview state management
const WebPreviewContext = React.createContext(null);

// Hook to access WebPreview context
const useWebPreviewContext = () => {
  const context = React.useContext(WebPreviewContext);
  if (!context) {
    throw new Error('WebPreview sub-components must be used within WebPreview');
  }
  return context;
};

export const WebPreview = React.forwardRef(({
  defaultUrl = '',
  onUrlChange,
  defaultViewMode = 'desktop',
  isResizing = false,
  className,
  children,
  ...props
}, ref) => {
  const [url, setUrl] = useState(defaultUrl);
  const [viewMode, setViewMode] = useState(defaultViewMode); // desktop, tablet, mobile
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logs, setLogs] = useState([]);
  const iframeRef = useRef(null);

  const handleUrlChange = useCallback((newUrl) => {
    setUrl(newUrl);
    onUrlChange?.(newUrl);
  }, [onUrlChange]);

  const addLog = useCallback((level, message) => {
    setLogs(prev => [...prev, { level, message, timestamp: new Date() }]);
  }, []);

  const navigate = useCallback((direction) => {
    if (iframeRef.current) {
      if (direction === 'back') {
        iframeRef.current.contentWindow?.history.back();
      } else {
        iframeRef.current.contentWindow?.history.forward();
      }
    }
  }, []);

  const context = {
    url,
    handleUrlChange,
    viewMode,
    setViewMode,
    isFullscreen,
    setIsFullscreen,
    isResizing,
    logs,
    addLog,
    navigate,
    iframeRef
  };

  return (
    <WebPreviewContext.Provider value={context}>
      <div
        ref={ref}
        className={cn('flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden', className)}
        {...props}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
});
WebPreview.displayName = 'WebPreview';

export const WebPreviewNavigation = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
WebPreviewNavigation.displayName = 'WebPreviewNavigation';

export const WebPreviewNavigationButton = React.forwardRef(({ 
  tooltip,
  className,
  children,
  ...props 
}, ref) => {
  const { navigate } = useWebPreviewContext();

  const handleClick = () => {
    if (props.onClick) {
      props.onClick();
    } else if (props.action === 'back') {
      navigate('back');
    } else if (props.action === 'forward') {
      navigate('forward');
    }
  };

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      className={cn('h-7 w-7', className)}
      title={tooltip}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Button>
  );
});
WebPreviewNavigationButton.displayName = 'WebPreviewNavigationButton';

export const WebPreviewUrl = React.forwardRef(({ className, ...props }, ref) => {
  const { url, handleUrlChange } = useWebPreviewContext();

  return (
    <input
      ref={ref}
      type="text"
      value={url}
      onChange={(e) => handleUrlChange(e.target.value)}
      className={cn(
        'flex-1 h-7 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary',
        'placeholder:text-muted-foreground text-muted-foreground',
        className
      )}
      placeholder="Enter URL..."
      {...props}
    />
  );
});
WebPreviewUrl.displayName = 'WebPreviewUrl';

export const WebPreviewBody = React.forwardRef(({ loading, className, ...props }, ref) => {
  const { viewMode, isFullscreen, isResizing, iframeRef } = useWebPreviewContext();

  const deviceStyles = {
    desktop: 'w-full h-full',
    tablet: 'max-w-[768px] h-full mx-auto border-x border-border',
    mobile: 'max-w-[375px] h-full mx-auto rounded-lg border border-border'
  };

  return (
    <div
      ref={ref}
      className={cn(
        'flex-1 relative bg-background overflow-auto',
        isFullscreen && 'fixed inset-0 z-50',
        isResizing && 'pointer-events-none',
        className
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          {loading}
        </div>
      )}
      <div className={cn(deviceStyles[viewMode], 'h-full')}>
        <iframe
          ref={iframeRef}
          className={cn(
            "w-full h-full border-0 bg-white",
            isResizing && "pointer-events-none"
          )}
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          {...props}
        />
      </div>
    </div>
  );
});
WebPreviewBody.displayName = 'WebPreviewBody';

export const WebPreviewConsole = React.forwardRef(({ logs, className, ...props }, ref) => {
  if (!logs || logs.length === 0) return null;

  const getLogColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        'border-t border-border bg-muted/30',
        className
      )}
      {...props}
    >
      <div className="p-2 border-b border-border">
        <h4 className="text-xs font-semibold text-muted-foreground">Console</h4>
      </div>
      <div className="h-32 overflow-auto p-2 font-mono text-xs space-y-1">
        {logs.map((log, index) => (
          <div key={index} className={cn('flex gap-2', getLogColor(log.level))}>
            <span className="text-muted-foreground shrink-0">
              {log.timestamp.toLocaleTimeString()}
            </span>
            <span className="text-muted-foreground shrink-0">
              [{log.level.toUpperCase()}]
            </span>
            <span className="flex-1 break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
WebPreviewConsole.displayName = 'WebPreviewConsole';
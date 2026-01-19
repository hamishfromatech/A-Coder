import React, { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Main Tool component - collapsible interface
export const Tool = React.forwardRef(({ 
  className,
  defaultOpen = false,
  children,
  ...props 
}, ref) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-card overflow-hidden',
        className
      )}
      {...props}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          if (child.type === ToolHeader) {
            return React.cloneElement(child, { 
              isOpen,
              onToggle: () => setIsOpen(!isOpen)
            });
          }
          if (child.type === ToolContent) {
            return isOpen ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
});
Tool.displayName = 'Tool';

// ToolHeader - displays tool type and state
export const ToolHeader = React.forwardRef(({ 
  type,
  state,
  isOpen = false,
  onToggle,
  className,
  title,
  ...props 
}, ref) => {
  const getStateIcon = () => {
    switch (state) {
      case 'input-available':
      case 'running':
        return (
          <div className="relative">
            <div className="absolute inset-0 animate-ping">
              <div className="w-full h-full rounded-full bg-primary opacity-20" />
            </div>
            <Icon name="loader" size={14} className="animate-spin" />
          </div>
        );
      case 'output-available':
        return <Icon name="checkCircle" size={14} className="text-green-500" />;
      case 'output-error':
        return <Icon name="alertCircle" size={14} className="text-red-500" />;
      case 'input-streaming':
      default:
        return <Icon name="clock" size={14} className="text-muted-foreground" />;
    }
  };

  const getStateBadge = () => {
    switch (state) {
      case 'input-streaming':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">Preparing</span>;
      case 'input-available':
      case 'running':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Executing</span>;
      case 'output-available':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">Completed</span>;
      case 'output-error':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-500/10 text-red-600 dark:text-red-400">Error</span>;
      default:
        return null;
    }
  };

  const getToolName = () => {
    if (title) return title;
    if (!type) return 'Tool';
    // Convert tool_type to Tool Type
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <button
      ref={ref}
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors',
        'text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
      {...props}
    >
      {/* State Indicator */}
      <div className="flex-shrink-0">
        {getStateIcon()}
      </div>

      {/* Tool Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground">
          {getToolName()}
        </span>
      </div>

      {/* State Badge */}
      {getStateBadge()}

      {/* Expand/Collapse Icon */}
      <Icon 
        name={isOpen ? 'chevronDown' : 'chevronRight'} 
        size={16} 
        className="text-muted-foreground shrink-0 ml-2"
      />
    </button>
  );
});
ToolHeader.displayName = 'ToolHeader';

// ToolContent - wrapper for tool input and output
export const ToolContent = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('p-4 space-y-4', className)}
      {...props}
    >
      {children}
    </div>
  );
});
ToolContent.displayName = 'ToolContent';

// ToolInput - displays tool input parameters
export const ToolInput = React.forwardRef(({ input, className, ...props }, ref) => {
  if (!input) return null;

  const formatJsonValue = (value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        try {
          return JSON.stringify(parsed, null, 2);
        } catch (e) {
          return value;
        }
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      // Handle circular references or other stringify errors
      if (typeof value === 'object' && value !== null) {
        try {
          // Try to stringify without the problematic properties
          const circularReplacer = () => {
            const seen = new WeakSet();
            return (key, value) => {
              if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                  return '[Circular]';
                }
                seen.add(value);
                // Handle React elements
                if (value.$$typeof) {
                  return '[React Element]';
                }
                // Handle React context
                if (value.constructor && value.constructor.name === 'Object' && key === '_context') {
                  return '[Circular: Context]';
                }
              }
              return value;
            };
          };
          return JSON.stringify(value, circularReplacer(), 2);
        } catch {
          // Last resort: display as object type
          return `[${value.constructor.name} object]`;
        }
      }
      return String(value);
    }
  };

  return (
    <div
      ref={ref}
      className={cn('space-y-2', className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Icon name="arrowUpRight" size={14} className="text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Input Parameters
        </h4>
      </div>
      <div className="rounded-lg bg-muted/50 border border-border overflow-hidden">
        <pre className="p-3 text-xs overflow-x-auto font-mono text-foreground/90">
          {formatJsonValue(input)}
        </pre>
      </div>
    </div>
  );
});
ToolInput.displayName = 'ToolInput';

// ToolOutput - displays tool output or error
export const ToolOutput = React.forwardRef(({ output, errorText, className, ...props }, ref) => {
  if (errorText) {
    return (
      <div
        ref={ref}
        className={cn('space-y-2', className)}
        {...props}
      >
        <div className="flex items-center gap-2">
          <Icon name="alertCircle" size={14} className="text-red-500" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-red-500">
            Error
          </h4>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            {errorText}
          </p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  return (
    <div
      ref={ref}
      className={cn('space-y-2', className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Icon name="arrowDownRight" size={14} className="text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Output
        </h4>
      </div>
      <div className="rounded-lg bg-muted/50 border border-border overflow-hidden">
        <div className="p-4 text-sm text-foreground/90">
          {output}
        </div>
      </div>
    </div>
  );
});
ToolOutput.displayName = 'ToolOutput';

// ToolList - legacy component for backward compatibility
export const ToolList = React.forwardRef(({ className, tools, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-2', className)}
      {...props}
    >
      {tools?.map((tool, index) => (
        <Tool key={index} defaultOpen={tool.status === 'completed' || tool.status === 'failed'}>
          <ToolHeader 
            type={tool.toolName || 'tool'}
            state={getToolStateFromStatus(tool.status)}
          />
          <ToolContent>
            <ToolInput input={tool.arguments} />
            <ToolOutput 
              output={typeof tool.result === 'string' ? tool.result : undefined}
              errorText={tool.error}
            />
          </ToolContent>
        </Tool>
      ))}
    </div>
  );
});

// Helper function to map legacy status to new state
function getToolStateFromStatus(status) {
  switch (status) {
    case 'input-streaming':
      return 'input-streaming';
    case 'executing':
    case 'running':
      return 'input-available';
    case 'completed':
      return 'output-available';
    case 'failed':
      return 'output-error';
    default:
      return 'input-streaming';
  }
}
ToolList.displayName = 'ToolList';
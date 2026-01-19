import React, { useState, useRef } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Reasoning = React.forwardRef(({ 
  className,
  reasoning,
  defaultExpanded = false,
  variant = 'default',
  ...props 
}, ref) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentRef = useRef(null);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  const variants = {
    default: 'bg-secondary/50 border-border',
    compact: 'bg-muted/30 border-border',
    minimal: 'bg-transparent border-transparent'
  };

  return (
    <div
      ref={ref}
      className={cn(
        'w-full rounded-lg border',
        variants[variant],
        className
      )}
      {...props}
    >
      {/* Header */}
      <Button
        variant="ghost"
        onClick={toggleExpanded}
        className={cn(
          'w-full justify-start gap-2 px-3 py-2 h-auto',
          'hover:bg-secondary/50'
        )}
      >
        <Icon 
          name={isExpanded ? 'chevronDown' : 'chevronRight'} 
          size={14} 
          className="transition-transform"
        />
        <Icon name="brain" size={14} className="text-primary" />
        <span className="text-sm font-medium">
          {variant === 'compact' ? 'Thinking...' : 'Thinking'}
        </span>
        {isExpanded && (
          <span className="ml-auto text-xs text-muted-foreground">
            Collapse
          </span>
        )}
      </Button>

      {/* Content */}
      {isExpanded && (
        <div
          ref={contentRef}
          className={cn(
            'px-3 pb-3 text-sm text-muted-foreground border-t border-border/50',
            'space-y-2'
          )}
        >
          {typeof reasoning === 'string' ? (
            <div className="whitespace-pre-wrap break-words">
              {reasoning}
            </div>
          ) : Array.isArray(reasoning) ? (
            reasoning.map((step, index) => (
              <div key={index} className="space-y-1">
                {step.title && (
                  <div className="font-medium text-foreground">
                    {step.title}
                  </div>
                )}
                {step.content && (
                  <div className="whitespace-pre-wrap break-words pl-3">
                    {step.content}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {typeof reasoning === 'string' 
                ? reasoning 
                : (() => {
                    try {
                      return JSON.stringify(reasoning, null, 2);
                    } catch (e) {
                      return '[Complex object]';
                    }
                  })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
Reasoning.displayName = 'Reasoning';

export const ReasoningCompact = React.forwardRef(({ className, isReasoning, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{isReasoning ? 'Thinking...' : 'Processing'}</span>
    </div>
  );
});
ReasoningCompact.displayName = 'ReasoningCompact';
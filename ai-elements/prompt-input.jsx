import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const PromptInput = React.forwardRef(({ 
  className,
  placeholder = "Message...",
  value,
  onChange,
  onSubmit,
  disabled = false,
  isLoading = false,
  onStop,
  actions = [],
  maxRows = 10,
  minHeight = 48,
  ...props 
}, ref) => {
  const textareaRef = useRef(null);
  const [height, setHeight] = useState(minHeight);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value && value.trim() && !disabled && !isLoading) {
        onSubmit?.(value);
      }
    }
  };

  const handleResize = () => {
    if (textareaRef.current) {
      const newHeight = Math.min(
        Math.max(textareaRef.current.scrollHeight, minHeight),
        minHeight * maxRows
      );
      setHeight(newHeight);
    }
  };

  useEffect(() => {
    handleResize();
  }, [value]);

  const handleSubmit = () => {
    if (value && value.trim() && !disabled && !isLoading) {
      onSubmit?.(value);
    }
  };

  const handleStop = () => {
    onStop?.();
  };

  return (
    <div className={cn('relative w-full', className)} {...props}>
      <div className="flex flex-col gap-2">
        <div className="relative flex items-end gap-3">
          {/* Textarea */}
          <div className="relative flex-1 rounded-xl border border-border bg-background hover:border-primary/50 transition-colors">
            <textarea
              ref={(node) => {
                textareaRef.current = node;
                if (typeof ref === 'function') {
                  ref(node);
                } else if (ref) {
                  ref.current = node;
                }
              }}
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              style={{ height: `${height}px` }}
              className={cn(
                'w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'placeholder:text-muted-foreground',
                'max-h-[320px]'
              )}
              rows={1}
            />
            
            {/* Action buttons */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="icon-sm"
                  onClick={action.onClick}
                  disabled={disabled || isLoading}
                  className="h-8 w-8"
                  title={action.title}
                >
                  {action.icon}
                </Button>
              ))}
              
              {/* Send/Stop button */}
              <Button
                type="button"
                size="icon-sm"
                disabled={disabled || (!value?.trim() && !isLoading)}
                onClick={isLoading ? handleStop : handleSubmit}
                className="h-8 w-8"
              >
                {isLoading ? (
                  <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                )}
              </Button>
            </div>
          </div>
        </div>
        
        {/* Hint/Status */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>•</span>
          <span>{value?.length || 0} characters</span>
        </div>
      </div>
    </div>
  );
});
PromptInput.displayName = 'PromptInput';
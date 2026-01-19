import React from 'react';
import { cn } from '@/lib/utils';

export const Message = React.forwardRef(({ className, from = 'assistant', isEditing, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'group flex gap-4 w-full px-4 py-8 border-b border-transparent transition-colors',
        from === 'assistant' ? 'bg-secondary/10' : 'bg-transparent',
        isEditing && 'is-editing',
        from === 'assistant' && 'is-assistant', 
        from === 'user' && 'is-user',
        from === 'system' && 'is-system',
        className
      )}
      {...props}
    >
      <div className="max-w-4xl mx-auto flex gap-4 w-full">
        {children}
      </div>
    </div>
  );
});
Message.displayName = 'Message';

export const MessageContent = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2 text-sm text-foreground flex-1 min-w-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
MessageContent.displayName = 'MessageContent';

export const MessageResponse = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        'prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border',
        'prose-headings:text-foreground prose-p:text-foreground/90',
        'prose-strong:text-foreground prose-code:text-foreground',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
MessageResponse.displayName = 'MessageResponse';
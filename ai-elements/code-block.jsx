import React, { useState } from 'react';
import { Prism } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CodeBlock = React.forwardRef(({ 
  className,
  code,
  language = 'text',
  title,
  filename,
  showLineNumbers = true,
  collapsible = false,
  defaultCollapsed = false,
  ...props 
}, ref) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <div
      ref={ref}
      className={cn('group rounded-lg border border-border bg-card', className)}
      {...props}
    >
      {/* Header */}
      {(title || filename || collapsible) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            {filename && (
              <Icon name="code" size={14} className="text-primary" />
            )}
            <span className="text-xs font-medium text-foreground">
              {title || filename || language}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              title={copied ? 'Copied!' : 'Copy code'}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
            </Button>
            {collapsible && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleCollapse}
                className="h-7 w-7"
              >
                <Icon 
                  name={isCollapsed ? 'chevronDown' : 'chevronUp'} 
                  size={14} 
                />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Code */}
      {!isCollapsed && (
        <div className="overflow-x-auto">
          <Prism
            language={language}
            style={vscDarkPlus}
            showLineNumbers={showLineNumbers}
            customStyle={{
              margin: 0,
              borderRadius: '0 0 0.5rem 0.5rem',
              fontSize: '0.875rem',
              maxHeight: '500px',
              overflow: 'auto'
            }}
            className={cn(
              '!bg-[#1e1e1e] !text-[#d4d4d4]',
              'rounded-b-lg'
            )}
          >
            {code}
          </Prism>
        </div>
      )}
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

export const CodeInline = React.forwardRef(({ 
  className,
  children,
  ...props 
}, ref) => {
  return (
    <code
      ref={ref}
      className={cn(
        'px-1.5 py-0.5 rounded bg-muted text-muted-foreground',
        'text-sm font-mono',
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
});
CodeInline.displayName = 'CodeInline';
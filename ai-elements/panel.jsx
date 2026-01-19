import React from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Panel = React.forwardRef(({ 
  className,
  title,
  icon,
  children,
  defaultCollapsed = false,
  collapsible = false,
  onToggle,
  isCollapsed = defaultCollapsed,
  actions = null,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card',
        className
      )}
      {...props}
    >
      {/* Header */}
      {(title || collapsible || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {icon && (
              <Icon name={icon} size={16} className="text-primary" />
            )}
            {title && (
              <span className="text-sm font-medium text-foreground">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {actions && (
              <div className="flex items-center gap-1">
                {actions}
              </div>
            )}
            {collapsible && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                className="h-6 w-6"
              >
                <Icon 
                  name={isCollapsed ? 'chevronRight' : 'chevronDown'} 
                  size={14} 
                />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {!isCollapsed && (
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      )}
    </div>
  );
});
Panel.displayName = 'Panel';

export const PanelContent = React.forwardRef(({ className, children, ...props }, ref) => {
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
PanelContent.displayName = 'PanelContent';

export const PanelSection = React.forwardRef(({ 
  className, 
  title, 
  children, 
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-2', className)}
      {...props}
    >
      {title && (
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      {children}
    </div>
  );
});
PanelSection.displayName = 'PanelSection';

export const PanelItem = React.forwardRef(({ 
  className, 
  icon, 
  label, 
  value, 
  onClick, 
  active = false,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {icon && (
        <Icon name={icon} size={14} className="text-muted-foreground flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {label && (
          <div className="text-sm font-medium truncate">
            {label}
          </div>
        )}
        {value && (
          <div className="text-xs text-muted-foreground truncate">
            {value}
          </div>
        )}
        {label && !value && (
          <div className="text-sm">
            {label}
          </div>
        )}
      </div>
    </div>
  );
});
PanelItem.displayName = 'PanelItem';
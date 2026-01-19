import React, { useState, createContext, useContext } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Context for Plan state management
const PlanContext = createContext(null);

// Hook to access Plan context
const usePlanContext = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('Plan sub-components must be used within Plan');
  }
  return context;
};

// Main Plan component - collapsible interface for displaying execution plans
export const Plan = React.forwardRef(({
  className,
  isStreaming = false,
  defaultOpen = false,
  children,
  ...props
}, ref) => {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  const context = {
    isExpanded,
    isStreaming,
    toggleExpand
  };

  const content = typeof children === 'function'
    ? children(context)
    : children;

  return (
    <PlanContext.Provider value={context}>
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-border bg-card',
          className
        )}
        {...props}
      >
        {content}
      </div>
    </PlanContext.Provider>
  );
});
Plan.displayName = 'Plan';

// PlanHeader - header section of the plan
export const PlanHeader = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-start gap-3 p-4 border-b border-border/50',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
PlanHeader.displayName = 'PlanHeader';

// PlanTitle - title text with shimmer animation when streaming
export const PlanTitle = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isStreaming } = usePlanContext();

  return (
    <h3
      ref={ref}
      className={cn(
        'text-base font-semibold text-foreground',
        isStreaming && 'animate-pulse',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
});
PlanTitle.displayName = 'PlanTitle';

// PlanDescription - description text with shimmer animation when streaming
export const PlanDescription = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isStreaming } = usePlanContext();

  return (
    <p
      ref={ref}
      className={cn(
        'text-sm text-muted-foreground mt-1',
        isStreaming && 'animate-pulse',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
});
PlanDescription.displayName = 'PlanDescription';

// PlanTrigger - clickable button to toggle expand/collapse
export const PlanTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isExpanded, toggleExpand } = usePlanContext();

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      onClick={toggleExpand}
      className={cn('h-8 w-8', className)}
      {...props}
    >
      {children || (
        <Icon
          name={isExpanded ? 'chevronUp' : 'chevronDown'}
          size={16}
        />
      )}
    </Button>
  );
});
PlanTrigger.displayName = 'PlanTrigger';

// PlanContent - collapsible content area
export const PlanContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isExpanded } = usePlanContext();

  if (!isExpanded) return null;

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
PlanContent.displayName = 'PlanContent';

// PlanFooter - footer section with actions
export const PlanFooter = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isExpanded } = usePlanContext();

  if (!isExpanded) return null;

  return (
    <div
      ref={ref}
      className={cn('border-t border-border p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
});
PlanFooter.displayName = 'PlanFooter';

// PlanAction - individual action button in the footer
export const PlanAction = React.forwardRef(({
  variant = 'outline',
  size = 'sm',
  icon,
  children,
  className,
  ...props
}, ref) => {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn('flex-1', className)}
      {...props}
    >
      {icon && <Icon name={icon} size={14} className="mr-2" />}
      {children}
    </Button>
  );
});
PlanAction.displayName = 'PlanAction';

// Legacy: Task component for plan task items (used internally)
export const Task = React.forwardRef(({
  className,
  title,
  description,
  status = 'pending',
  dependencies = [],
  onClick,
  isActive = false,
  taskNumber,
  ...props
}, ref) => {
  const statusStyles = {
    pending: 'border-border bg-card',
    in_progress: 'border-primary/50 bg-primary/5',
    completed: 'border-green-500/30 bg-green-500/5',
    failed: 'border-red-500/30 bg-red-500/5'
  };

  const statusIcon = {
    pending: 'circle',
    in_progress: 'loader',
    completed: 'checkCircle',
    failed: 'alertCircle'
  };

  const statusColor = {
    pending: 'text-muted-foreground',
    in_progress: 'text-primary',
    completed: 'text-green-500',
    failed: 'text-red-500'
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border p-3 transition-all cursor-pointer',
        statusStyles[status],
        isActive && 'ring-2 ring-primary ring-offset-2',
        status === 'in_progress' && 'animate-pulse',
        className
      )}
      onClick={onClick}
      {...props}
    >
      <div className="flex items-start gap-3">
        {/* Task Number & Status */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-muted">
            {taskNumber}
          </div>
          <Icon
            name={statusIcon[status]}
            size={14}
            className={statusColor[status]}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-foreground">
                {title}
              </h4>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Dependencies */}
          {dependencies.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Icon name="link" size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Depends on: {dependencies.join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
Task.displayName = 'Task';

// Legacy: PlanList for multiple plans
export const PlanList = React.forwardRef(({
  className,
  plans = [],
  activePlanId,
  onSelectPlan,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-3', className)}
      {...props}
    >
      {plans.map((plan, index) => (
        <div
          key={plan.id || index}
          onClick={() => onSelectPlan?.(plan.id || index)}
          className={cn(
            'cursor-pointer transition-all',
            activePlanId === (plan.id || index) && 'ring-2 ring-primary ring-offset-2'
          )}
        >
          <Plan {...plan} />
        </div>
      ))}
    </div>
  );
});
PlanList.displayName = 'PlanList';
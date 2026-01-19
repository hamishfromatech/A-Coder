import React, { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Main Task component - collapsible interface with progress tracking
export const Task = React.forwardRef(({ 
  className,
  defaultOpen = false,
  status = 'pending',
  progress = 0,
  totalCount = 0,
  completedCount = 0,
  children,
  ...props 
}, ref) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const getStatusIcon = () => {
    switch (status) {
      case 'in_progress':
        return (
          <div className="relative">
            <div className="absolute inset-0 animate-ping">
              <div className="w-full h-full rounded-full bg-primary opacity-20" />
            </div>
            <Icon name="loader" size={14} className="animate-spin" />
          </div>
        );
      case 'completed':
        return <Icon name="checkCircle" size={14} className="text-green-500" />;
      case 'error':
        return <Icon name="alertCircle" size={14} className="text-red-500" />;
      case 'pending':
      default:
        return <Icon name="circle" size={14} className="text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'in_progress':
        return 'border-primary/50 bg-primary/5';
      case 'completed':
        return 'border-green-500/30 bg-green-500/5';
      case 'error':
        return 'border-red-500/30 bg-red-500/5';
      default:
        return 'border-border bg-card';
    }
  };

  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : progress;

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border overflow-hidden transition-all',
        getStatusColor(),
        className
      )}
      {...props}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          if (child.type === TaskTrigger) {
            return React.cloneElement(child, { 
              isOpen,
              onToggle: () => setIsOpen(!isOpen),
              status,
              completedCount,
              totalCount
            });
          }
          if (child.type === TaskContent) {
            return isOpen ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
});
Task.displayName = 'Task';

// TaskTrigger - clickable header for expanding/collapsing
export const TaskTrigger = React.forwardRef(({ 
  title,
  isOpen = false,
  onToggle,
  status,
  completedCount = 0,
  totalCount = 0,
  className,
  ...props 
}, ref) => {
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

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
      {/* Status Indicator */}
      <div className="flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
          {status === 'completed' && (
            <Icon name="check" size={12} className="text-green-500" />
          )}
          {status === 'in_progress' && (
            <Icon name="loader2" size={12} className="animate-spin text-primary" />
          )}
          {status === 'pending' && (
            <Icon name="circle" size={8} className="text-muted-foreground" />
          )}
          {status === 'error' && (
            <Icon name="x" size={12} className="text-red-500" />
          )}
        </div>
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground block truncate">
          {title}
        </span>
        
        {/* Progress Indicator */}
        {(totalCount > 0 || progressPercentage > 0) && (
          <div className="mt-1.5">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  status === 'completed' ? 'bg-green-500' : 'bg-primary'
                )}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-0.5 text-[10px] text-muted-foreground">
              <span>Progress</span>
              <span>{totalCount > 0 ? `${completedCount}/${totalCount}` : `${Math.round(progressPercentage)}%`}</span>
            </div>
          </div>
        )}
      </div>

      {/* Expand/Collapse Icon */}
      <Icon 
        name={isOpen ? 'chevronDown' : 'chevronRight'} 
        size={16} 
        className="text-muted-foreground shrink-0"
      />
    </button>
  );
});
TaskTrigger.displayName = 'TaskTrigger';

// TaskContent - collapsible content area
export const TaskContent = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('p-4 space-y-3', className)}
      {...props}
    >
      {children}
    </div>
  );
});
TaskContent.displayName = 'TaskContent';

// TaskItem - individual task step/item
export const TaskItem = React.forwardRef(({ className, children, status = 'pending', ...props }, ref) => {
  const getItemIcon = () => {
    switch (status) {
      case 'completed':
        return <Icon name="check" size={12} className="text-green-500" />;
      case 'in_progress':
        return <Icon name="loader2" size={12} className="animate-spin text-primary" />;
      case 'error':
        return <Icon name="x" size={12} className="text-red-500 flex-shrink-0" />;
      default:
        return <Icon name="circle" size={8} className="text-muted-foreground flex-shrink-0" />;
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-start gap-2 text-sm',
        status === 'completed' && 'text-muted-foreground',
        status === 'in_progress' && 'text-foreground',
        className
      )}
      {...props}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getItemIcon()}
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
});
TaskItem.displayName = 'TaskItem';

// TaskItemFile - display file references within task items
export const TaskItemFile = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-xs',
        'font-mono hover:bg-muted/70 transition-colors',
        className
      )}
      {...props}
    >
      <Icon name="file" size={12} className="text-muted-foreground" />
      {children}
    </span>
  );
});
TaskItemFile.displayName = 'TaskItemFile';

// TaskList - container for multiple tasks
export const TaskList = React.forwardRef(({ className, tasks, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-3', className)}
      {...props}
    >
      {tasks?.map((task, index) => (
        <Task 
          key={task.id || index} 
          defaultOpen={task.status === 'completed' || task.status === 'in_progress'}
          status={task.status}
          progress={task.progress}
          totalCount={task.totalCount}
          completedCount={task.completedCount}
        >
          <TaskTrigger title={task.title} />
          <TaskContent>
            {task.items?.map((item, itemIndex) => (
              <TaskItem key={itemIndex} status={item.status}>
                {item.text}
                {item.file && (
                  <TaskItemFile>
                    {item.file.name}
                  </TaskItemFile>
                )}
              </TaskItem>
            ))}
          </TaskContent>
        </Task>
      ))}
    </div>
  );
});
TaskList.displayName = 'TaskList';
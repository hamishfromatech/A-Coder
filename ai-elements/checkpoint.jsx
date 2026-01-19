import React from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Main Checkpoint component - provides a way to mark and restore conversation states
export const Checkpoint = React.forwardRef(({ 
  className,
  children,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 py-4',
        className
      )}
      {...props}
    >
      {children}
      {/* Separator line for clear conversation breaks */}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
});
Checkpoint.displayName = 'Checkpoint';

// CheckpointIcon - displays the bookmark icon (or custom icon)
export const CheckpointIcon = React.forwardRef(({ 
  className,
  children,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex-shrink-0', className)}
      {...props}
    >
      {children || (
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center bg-muted',
          'border border-border'
        )}>
          <Icon name="bookmark" size={14} className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
});
CheckpointIcon.displayName = 'CheckpointIcon';

// CheckpointTrigger - clickable restore button
export const CheckpointTrigger = React.forwardRef(({ 
  className,
  variant = 'ghost',
  size = 'sm',
  children,
  ...props 
}, ref) => {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'flex-shrink-0',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
});
CheckpointTrigger.displayName = 'CheckpointTrigger';

// Legacy CheckpointPanel - for backward compatibility
export const CheckpointPanel = React.forwardRef(({ 
  className,
  checkpoints = [],
  activeCheckpointId,
  onRestore,
  onDelete,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('rounded-lg border border-border bg-card', className)}
      {...props}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="bookmark" size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Checkpoints
          </span>
          <span className="text-xs text-muted-foreground">
            ({checkpoints.length})
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2 max-h-64 overflow-auto">
        {checkpoints.map((checkpoint) => (
          <div
            key={checkpoint.id}
            className={cn(
              'group relative rounded-lg border p-3 transition-all',
              activeCheckpointId === checkpoint.id
                ? 'bg-primary/10 border-primary/30' 
                : 'bg-card border-border hover:border-primary/30'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  activeCheckpointId === checkpoint.id 
                    ? 'bg-primary/20 text-primary' 
                    : 'bg-secondary text-muted-foreground'
                )}>
                  <Icon name="bookmark" size={16} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Title */}
                <h4 className="text-sm font-medium text-foreground truncate">
                  {checkpoint.title || `Checkpoint ${checkpoint.id}`}
                </h4>

                {/* Description */}
                {checkpoint.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {checkpoint.description}
                  </p>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(checkpoint.timestamp).toLocaleString()}
                  </span>
                  {checkpoint.mode && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {checkpoint.mode}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className={cn(
                'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'
              )}>
                {onRestore && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRestore(checkpoint.id)}
                    className="h-7 w-7"
                    title="Restore"
                  >
                    <Icon name="refresh" size={14} />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(checkpoint.id)}
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete"
                  >
                    <Icon name="trash" size={14} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {checkpoints.length === 0 && (
          <div className="text-center py-8">
            <Icon name="bookmark" size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No checkpoints yet</p>
          </div>
        )}
      </div>
    </div>
  );
});
CheckpointPanel.displayName = 'CheckpointPanel';

// CheckpointList - list of checkpoints
export const CheckpointList = React.forwardRef(({ 
  className,
  checkpoints = [],
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-2', className)}
      {...props}
    >
      {checkpoints.map((checkpoint) => (
        <Checkpoint
          key={checkpoint.id}
          {...checkpoint}
        />
      ))}
    </div>
  );
});
CheckpointList.displayName = 'CheckpointList';
import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Artifact = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card shadow-sm',
        className
      )}
      {...props}
    />
  );
});
Artifact.displayName = 'Artifact';

export const ArtifactHeader = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-border',
        className
      )}
      {...props}
    />
  );
});
ArtifactHeader.displayName = 'ArtifactHeader';

export const ArtifactTitle = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  );
});
ArtifactTitle.displayName = 'ArtifactTitle';

export const ArtifactDescription = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn('text-xs text-muted-foreground mt-0.5', className)}
      {...props}
    />
  );
});
ArtifactDescription.displayName = 'ArtifactDescription';

export const ArtifactActions = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  );
});
ArtifactActions.displayName = 'ArtifactActions';

export const ArtifactAction = React.forwardRef(({ 
  icon: Icon, 
  tooltip, 
  label, 
  className,
  ...props 
}, ref) => {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      className={cn('h-7 w-7', className)}
      title={tooltip}
      aria-label={label}
      {...props}
    >
      {Icon && <Icon size={14} />}
    </Button>
  );
});
ArtifactAction.displayName = 'ArtifactAction';

export const ArtifactClose = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      className={cn('h-7 w-7', className)}
      {...props}
    />
  );
});
ArtifactClose.displayName = 'ArtifactClose';

export const ArtifactContent = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('p-4 space-y-4', className)}
      {...props}
    />
  );
});
ArtifactContent.displayName = 'ArtifactContent';
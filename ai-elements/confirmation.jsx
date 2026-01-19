import React from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Main Confirmation component - container for tool approval workflow
export const Confirmation = React.forwardRef(({
  approval,
  state,
  className,
  children,
  ...props
}, ref) => {
  // Don't render if no approval
  if (!approval) return null;
  // User snippet implies handling various states, but let's stick to hiding if no approval prop.
  // Note: We don't hide on specific states here to allow flexibility, 
  // relying on the children (ConfirmationTitle/Actions) to handle visibility based on state.

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border p-4 space-y-3',
        approval.approved
          ? 'border-green-500/30 bg-green-500/5'
          : (state === 'output-denied' || (state && state.includes('rejected')))
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-border bg-card',
        className
      )}
      {...props}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          // Pass state and approval to ConfirmationTitle
          if (child.type === ConfirmationTitle) {
            return React.cloneElement(child, { state, approval });
          }
          // Support direct children for backward compatibility
          if (child.type === ConfirmationRequest) {
             return state === 'approval-requested' ? child : null;
          }
          if (child.type === ConfirmationAccepted) {
            if ((state === 'approval-responded' || state === 'output-available' || state === 'output-denied') && approval.approved) {
              return child;
            }
            return null;
          }
          if (child.type === ConfirmationRejected) {
            if ((state === 'approval-responded' || state === 'output-available' || state === 'output-denied') && !approval.approved) {
              return child;
            }
            return null;
          }
          if (child.type === ConfirmationActions) {
            return state === 'approval-requested' ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
});
Confirmation.displayName = 'Confirmation';

// ConfirmationTitle - wrapper for status messages
export const ConfirmationTitle = React.forwardRef(({ state, approval, className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-1', className)}
      {...props}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          if (child.type === ConfirmationRequest) {
            return state === 'approval-requested' ? child : null;
          }
          if (child.type === ConfirmationAccepted) {
            // Show if approved AND not in requested state anymore
            return (approval?.approved && state !== 'approval-requested') ? child : null;
          }
          if (child.type === ConfirmationRejected) {
            // Show if rejected AND not in requested state anymore
            return (!approval?.approved && state !== 'approval-requested') ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
});
ConfirmationTitle.displayName = 'ConfirmationTitle';

// ConfirmationRequest - content shown when approval is requested
export const ConfirmationRequest = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-start gap-2', className)}
      {...props}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Icon name="alertCircle" size={12} className="text-amber-600 dark:text-amber-400" />
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground mb-1">Approval Required</p>
        <div className="text-sm text-foreground/80">
          {children}
        </div>
      </div>
    </div>
  );
});
ConfirmationRequest.displayName = 'ConfirmationRequest';

// ConfirmationAccepted - content shown when approval is accepted
export const ConfirmationAccepted = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 text-sm', className)}
      {...props}
    >
      {children || (
        <>
          <Icon name="check" size={14} className="text-green-600 dark:text-green-400" />
          <span className="text-green-600 dark:text-green-400">You approved this tool execution</span>
        </>
      )}
    </div>
  );
});
ConfirmationAccepted.displayName = 'ConfirmationAccepted';

// ConfirmationRejected - content shown when approval is rejected
export const ConfirmationRejected = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 text-sm', className)}
      {...props}
    >
      {children || (
        <>
          <Icon name="x" size={14} className="text-red-600 dark:text-red-400" />
          <span className="text-red-600 dark:text-red-400">You rejected this tool execution</span>
        </>
      )}
    </div>
  );
});
ConfirmationRejected.displayName = 'ConfirmationRejected';

// ConfirmationActions - container for action buttons
export const ConfirmationActions = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 justify-end mt-3', className)}
      {...props}
    >
      {children}
    </div>
  );
});
ConfirmationActions.displayName = 'ConfirmationActions';

// ConfirmationAction - individual action button
export const ConfirmationAction = React.forwardRef(({ className, variant = 'outline', children, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant={variant}
      size="sm"
      className={cn('h-8 px-3 text-sm', className)}
      {...props}
    >
      {children}
    </Button>
  );
});
ConfirmationAction.displayName = 'ConfirmationAction';

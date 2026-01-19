import React from 'react';
import { Icon } from '../ui/icons';
import { cn } from '../../lib/utils';

export const AgentLoopProgress = ({ 
  agentLoopState, 
  className 
}) => {
  if (!agentLoopState.isRunning && agentLoopState.currentIteration === 0) return null;

  return (
    <div className={cn(
      "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              🤖 Agent Loop Active
            </span>
          </div>
          {agentLoopState.parallelExecution && (
            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs rounded-full font-medium">
              ⚡ Parallel Mode
            </span>
          )}
        </div>
        <div className="text-xs text-blue-600 dark:text-blue-400">
          Iteration {agentLoopState.currentIteration}/{agentLoopState.maxIterations}
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-2 mb-3">
        <div 
          className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${(agentLoopState.currentIteration / agentLoopState.maxIterations) * 100}%` }}
        />
      </div>

      {/* Tool Status Summary */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-blue-600 dark:text-blue-400">
            {agentLoopState.activeTools?.length || 0} Active
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-green-600 dark:text-green-400">
            {agentLoopState.completedTools?.length || 0} Completed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-red-600 dark:text-red-400">
            {agentLoopState.failedTools?.length || 0} Failed
          </span>
        </div>
      </div>
    </div>
  );
};

export const ToolExecutionTimeline = ({ 
  events = [], 
  className 
}) => {
  if (!events || events.length === 0) return null;

  return (
    <div className={cn("bg-muted/30 rounded-lg border p-4 mb-4", className)}>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Tool Execution Timeline</h3>
      <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
        {events.slice(-5).map((event) => (
          <div key={event.id || Math.random()} className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground shrink-0">
              {event.timestamp instanceof Date ? event.timestamp.toLocaleTimeString() : new Date().toLocaleTimeString()}
            </span>
            <span className={cn(
              "px-2 py-1 rounded-full font-medium flex items-center gap-1 truncate max-w-[200px]",
              event.status === 'executing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
              event.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
              event.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
            )}>
              {event.status === 'executing' ? '🔧' :
               event.status === 'completed' ? '✅' :
               event.status === 'failed' ? '❌' : '⚡'} 
              <span className="truncate">{event.toolName}</span>
            </span>
            {event.details && (
              <span className="text-muted-foreground truncate flex-1" title={event.details}>
                {typeof event.details === 'string' && event.details.length > 50 
                  ? event.details.substring(0, 50) + '...' 
                  : event.details}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

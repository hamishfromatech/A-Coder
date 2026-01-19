import React, { useState, useMemo } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tool,
  ToolList,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput
} from './tool';

/**
 * Convert InlineToolCalls timeline data to Tool component format
 */
export function convertTimelineToTools(toolExecutionTimeline = [], parallelExecution = false) {
  // Group by tool name and ID to handle duplicates from streaming
  const uniqueExecutions = new Map();

  toolExecutionTimeline.forEach(event => {
    if (['executing', 'completed', 'failed', 'queued'].includes(event.status)) {
      const key = event.id || event.toolName;
      uniqueExecutions.set(key, event);
    }
  });

  // Convert to Tool component format
  return Array.from(uniqueExecutions.values()).map(exec => {
    // Map status to Tool component state
    const stateMap = {
      'executing': 'input-available',
      'completed': 'output-available',
      'failed': 'output-error',
      'queued': 'input-streaming'
    };

    return {
      toolName: exec.toolName,
      state: stateMap[exec.status] || 'input-streaming',
      input: exec.details ? { details: exec.details } : undefined,
      output: exec.status === 'completed' || exec.status === 'failed'
        ? exec.result || exec.details
        : undefined,
      errorText: exec.status === 'failed' ? (exec.result || 'Execution failed') : undefined,
      isParallel: parallelExecution,
      timestamp: exec.timestamp
    };
  });
}

/**
 * ToolWrapper - Wrapper component that displays tool execution timeline
 * using the ai-elements Tool component
 */
export function ToolWrapper({
  toolExecutionTimeline = [],
  parallelExecution = false,
  theme = 'dark',
  className
}) {
  const [expandedTools, setExpandedTools] = useState(new Set());

  const tools = useMemo(() => {
    return convertTimelineToTools(toolExecutionTimeline, parallelExecution);
  }, [toolExecutionTimeline, parallelExecution]);

  // Status summary
  const statusSummary = useMemo(() => {
    const summary = {
      executing: 0,
      completed: 0,
      failed: 0,
      queued: 0
    };

    toolExecutionTimeline.forEach(exec => {
      if (summary[exec.status] !== undefined) {
        summary[exec.status]++;
      }
    });

    return summary;
  }, [toolExecutionTimeline]);

  if (tools.length === 0) {
    return null;
  }

  const toggleExpand = (index) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Auto-expand failed tools
  useMemo(() => {
    tools.forEach((tool, index) => {
      if (tool.state === 'output-error' && !expandedTools.has(index)) {
        setExpandedTools(prev => new Set([...prev, index]));
      }
    });
  }, [tools]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Status Summary Bar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium',
        theme === 'dark'
          ? 'bg-muted/30 border-border text-muted-foreground'
          : 'bg-gray-100 border-gray-200 text-gray-600'
      )}>
        <span className="flex items-center gap-1">
          <Icon name="tool" size={12} />
          {tools.length} Tool{tools.length > 1 ? 's' : ''}
        </span>
        {statusSummary.executing > 0 && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Icon name="loader" size={10} className="animate-spin" />
            {statusSummary.executing} running
          </span>
        )}
        {statusSummary.completed > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Icon name="check" size={10} />
            {statusSummary.completed} done
          </span>
        )}
        {statusSummary.failed > 0 && (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <Icon name="alertCircle" size={10} />
            {statusSummary.failed} failed
          </span>
        )}
      </div>

      {/* Tool List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {tools.map((tool, index) => (
          <Tool
            key={`${tool.toolName}-${index}`}
            defaultOpen={expandedTools.has(index) || tool.state === 'output-error'}
          >
            <ToolHeader
              type={tool.toolName}
              state={tool.state}
            />
            <ToolContent>
              <ToolInput input={tool.input} />
              <ToolOutput
                output={tool.output && (
                  <pre className={cn(
                    'text-xs font-mono whitespace-pre-wrap break-all p-3 rounded max-h-48 overflow-y-auto',
                    tool.state === 'output-error'
                      ? theme === 'dark'
                        ? 'bg-red-950/50 text-red-400 border border-red-900/30'
                        : 'bg-red-50 text-red-600 border border-red-200'
                      : theme === 'dark'
                        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  )}>
                    {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
                  </pre>
                )}
                errorText={tool.errorText}
              />
              {tool.isParallel && (
                <div className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium inline-block',
                  theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                )}>
                  PARALLEL EXECUTION
                </div>
              )}
              {tool.timestamp && (
                <div className={cn(
                  'text-[10px]',
                  theme === 'dark' ? 'text-muted-foreground' : 'text-gray-400'
                )}>
                  {new Date(tool.timestamp).toLocaleTimeString()}
                </div>
              )}
            </ToolContent>
          </Tool>
        ))}
      </div>
    </div>
  );
}

/**
 * InlineToolWrapper - Simpler wrapper for single tool displays
 * Compatible with the existing InlineToolCall pattern
 */
export function InlineToolWrapper({
  toolName,
  status = 'executing',
  details,
  result,
  theme = 'dark',
  timestamp,
  isParallel = false
}) {
  const [isExpanded, setIsExpanded] = useState(status !== 'completed');

  const stateMap = {
    'executing': 'input-available',
    'completed': 'output-available',
    'failed': 'output-error',
    'queued': 'input-streaming'
  };

  const state = stateMap[status] || 'input-streaming';

  return (
    <Tool defaultOpen={status === 'failed'}>
      <ToolHeader type={toolName} state={state} />
      <ToolContent>
        <ToolInput input={details ? { details } : undefined} />
        <ToolOutput
          output={result && (
            <pre className={cn(
              'text-xs font-mono whitespace-pre-wrap break-all p-3 rounded max-h-48 overflow-y-auto',
              status === 'failed'
                ? theme === 'dark'
                  ? 'bg-red-950/50 text-red-400 border border-red-900/30'
                  : 'bg-red-50 text-red-600 border border-red-200'
                : theme === 'dark'
                  ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
            )}>
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
          errorText={status === 'failed' ? (result || 'Execution failed') : undefined}
        />
        {isParallel && (
          <div className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium inline-block',
            theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
          )}>
            PARALLEL
          </div>
        )}
        {timestamp && (
          <div className={cn(
            'text-[10px]',
            theme === 'dark' ? 'text-muted-foreground' : 'text-gray-400'
          )}>
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}

ToolWrapper.displayName = 'ToolWrapper';
InlineToolWrapper.displayName = 'InlineToolWrapper';
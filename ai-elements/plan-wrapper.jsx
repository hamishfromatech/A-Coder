import React, { useMemo } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
  PlanAction,
  PlanningTask
} from './plan';

/**
 * Parse markdown plan content into structured plan data
 */
export function parseMarkdownPlan(markdown) {
  if (!markdown) return null;

  const lines = markdown.split('\n');
  const result = {
    title: 'Project Plan',
    description: '',
    status: 'pending',
    tasks: []
  };

  let currentPhase = null;
  let currentTasks = [];
  let inPhase = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('# ')) {
      result.title = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentPhase && currentTasks.length > 0) {
        result.tasks.push({
          id: `phase-${result.tasks.length}`,
          title: currentPhase,
          status: 'pending',
          items: [...currentTasks]
        });
      }
      currentPhase = line.slice(3).trim();
      currentTasks = [];
      inPhase = true;
      continue;
    }

    if (inPhase && (line.startsWith('- [') || line.startsWith('* ['))) {
      const isCompleted = line.startsWith('- [x]') || line.startsWith('* [x]');
      const taskText = line.replace(/^[-*]\s*\[[x ]\]\s*/, '').trim();

      let priority = 'medium';
      let cleanText = taskText;
      const priorityMatch = taskText.match(/\(Priority:\s*(High|Medium|Low)\)/i);
      if (priorityMatch) {
        priority = priorityMatch[1].toLowerCase();
        cleanText = taskText.replace(/\(Priority:\s*(High|Medium|Low)\)/i, '').trim();
      }

      currentTasks.push({
        text: cleanText,
        status: isCompleted ? 'completed' : 'pending',
        priority
      });
    } else if (inPhase && (line.startsWith('- ') || line.startsWith('* '))) {
      currentTasks.push({
        text: line.replace(/^[-*]\s*/, '').trim(),
        status: 'pending'
      });
    }

    if (!result.description && line && !line.startsWith('#') && !line.startsWith('##')) {
      result.description = line;
    }
  }

  if (currentPhase && currentTasks.length > 0) {
    result.tasks.push({
      id: `phase-${result.tasks.length}`,
      title: currentPhase,
      status: 'pending',
      items: currentTasks
    });
  }

  return result;
}

/**
 * PlanWrapper - Correctly implements the Plan sub-components
 */
export function PlanWrapper({
  markdown,
  status = 'pending',
  onApprove,
  onReject,
  onEdit,
  theme = 'dark',
  className
}) {
  const planData = useMemo(() => parseMarkdownPlan(markdown), [markdown]);

  if (!planData || planData.tasks.length === 0) {
    return null;
  }

  const completedTasks = planData.tasks.reduce((sum, phase) => {
    return sum + phase.items.filter(item => item.status === 'completed').length;
  }, 0);
  const totalTasks = planData.tasks.reduce((sum, phase) => sum + phase.items.length, 0);
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <Plan className={cn('bg-background shadow-blueprint-dark border-primary/20', className)} defaultOpen={true}> 
      <PlanHeader>
        <div className="flex-1 min-w-0">
          <PlanTitle>{planData.title}</PlanTitle>
          <PlanDescription>{planData.description}</PlanDescription>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">
              {completedTasks}/{totalTasks} TASKS_READY
            </span>
          </div>
        </div>
        <PlanTrigger />
      </PlanHeader>

      <PlanContent>
        <div className="space-y-6">
          {planData.tasks.map((phase, phaseIdx) => (
            <div key={phase.id || phaseIdx} className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 flex items-center gap-2">
                <span className="w-4 h-px bg-primary/30" />
                {phase.title}
              </h4>
              <div className="grid gap-2">
                {phase.items.map((item, itemIdx) => (
                  <div 
                    key={itemIdx} 
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/5 hover:bg-secondary/10 transition-colors"
                  >
                    {item.status === 'completed' ? (
                      <Icon name="checkCircle" size={14} className="text-primary" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50" />
                    )}
                    <span className={cn(
                      "text-sm flex-1",
                      item.status === 'completed' && "text-muted-foreground line-through"
                    )}>
                      {item.text}
                    </span>
                    {item.priority && (
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        item.priority === 'high' ? "bg-red-500/10 text-red-500" :
                        item.priority === 'medium' ? "bg-yellow-500/10 text-yellow-500" :
                        "bg-blue-500/10 text-blue-500"
                      )}>
                        {item.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PlanContent>

      {(onApprove || onReject || onEdit) && status === 'pending' && (
        <PlanFooter className="flex gap-2">
          {onReject && (
            <PlanAction variant="ghost" onClick={onReject} className="text-destructive hover:bg-destructive/10">
              <Icon name="trash" size={14} className="mr-2" />
              REJECT
            </PlanAction>
          )}
          {onEdit && (
            <PlanAction variant="outline" onClick={onEdit}>
              <Icon name="edit" size={14} className="mr-2" />
              EDIT
            </PlanAction>
          )}
          {onApprove && (
            <PlanAction variant="default" onClick={onApprove} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Icon name="zap" size={14} className="mr-2" />
              APPROVE_EXECUTION
            </PlanAction>
          )}
        </PlanFooter>
      )}
    </Plan>
  );
}

/**
 * PlanContentDisplay - Simplified version for display only
 */
export function PlanContentDisplay({
  markdown,
  theme = 'dark',
  className
}) {
  const planData = useMemo(() => parseMarkdownPlan(markdown), [markdown]);

  if (!planData || planData.tasks.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{planData.title}</h3>
        <p className="text-sm text-muted-foreground">{planData.description}</p>
      </div>
      
      {planData.tasks.map((phase, index) => (
        <div key={index} className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-primary/60">{phase.title}</h4>
          <div className="grid gap-2">
            {phase.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/30 border border-border/50">
                <Icon name="circle" size={10} className="text-muted-foreground" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

PlanWrapper.displayName = 'PlanWrapper';
PlanContentDisplay.displayName = 'PlanContentDisplay';

/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Planning Service - Manages AI agent task planning and execution state
 * Allows the AI to create structured plans, track task progress, and maintain state across conversations
 */

import { Event, Emitter } from '../../../../base/common/event.js';

export type TaskId = string;

export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';

export interface Task {
	id: TaskId;
	description: string;
	status: TaskStatus;
	dependencies: TaskId[];
	notes?: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface Plan {
	id: string;
	goal: string;
	tasks: Task[];
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Ephemeral in-memory planning service.
 *
 * Plans are stored PER THREAD so that switching conversations does not clobber
 * one thread's plan with another's. The public `onDidChangePlan` event and
 * `getPlanStatus()` (called with no thread id) reflect the ACTIVE thread, which
 * is set via `switchToThread` when the user changes conversations. Tool calls
 * may pass an explicit `threadId` to operate on the thread the agent is
 * running in, even if it isn't the active one in the UI.
 *
 * State is cleared when the IDE is restarted.
 */
export class PlanningService {
	private plansByThread = new Map<string, Plan>();
	private activeThreadId = '__default__';
	private readonly _onDidChangePlan = new Emitter<Plan | null>();
	public readonly onDidChangePlan: Event<Plan | null> = this._onDidChangePlan.event;

	/**
	 * Set the active thread and emit its plan so the UI updates on switch.
	 */
	switchToThread(threadId: string): void {
		if (this.activeThreadId === threadId) return;
		this.activeThreadId = threadId;
		this._onDidChangePlan.fire(this.plansByThread.get(threadId) ?? null);
	}

	private _tid(threadId?: string): string {
		return threadId ?? this.activeThreadId;
	}

	private _planFor(threadId?: string): Plan | null {
		return this.plansByThread.get(this._tid(threadId)) ?? null;
	}

	private _setPlan(plan: Plan | null, threadId?: string): void {
		const tid = this._tid(threadId);
		if (plan) {
			this.plansByThread.set(tid, plan);
		} else {
			this.plansByThread.delete(tid);
		}
	}

	private _fireIfActive(threadId?: string): void {
		if (this._tid(threadId) === this.activeThreadId) {
			this._onDidChangePlan.fire(this._planFor(this.activeThreadId));
		}
	}

	/**
	 * Creates a new plan, replacing any existing plan for the thread
	 */
	createPlan(goal: string, tasks: Array<{ id: string; description: string; dependencies?: string[] }>, threadId?: string): Plan {
		const now = new Date();

		const plan: Plan = {
			id: this.generatePlanId(),
			goal,
			tasks: tasks.map(t => ({
				id: t.id,
				description: t.description,
				status: 'pending' as TaskStatus,
				dependencies: t.dependencies || [],
				createdAt: now,
				updatedAt: now,
			})),
			createdAt: now,
			updatedAt: now,
		};

		this._setPlan(plan, threadId);
		this._fireIfActive(threadId);
		return plan;
	}

	/**
	 * Updates the status of a task in the current plan
	 */
	updateTaskStatus(taskId: TaskId, status: TaskStatus, notes?: string, threadId?: string): Task {
		const plan = this._planFor(threadId);
		if (!plan) {
			throw new Error('No active plan. Create a plan first using create_plan.');
		}

		const task = plan.tasks.find(t => t.id === taskId);
		if (!task) {
			throw new Error(`Task with id "${taskId}" not found in current plan. Available task IDs: ${plan.tasks.map(t => t.id).join(', ')}`);
		}

		task.status = status;
		task.updatedAt = new Date();
		if (notes) {
			task.notes = notes;
		}

		plan.updatedAt = new Date();
		this._fireIfActive(threadId);
		return task;
	}

	/**
	 * Adds new tasks to the current plan
	 */
	addTasksToPlan(tasks: Array<{ id: string; description: string; dependencies?: string[] }>, threadId?: string): Plan {
		const plan = this._planFor(threadId);
		if (!plan) {
			throw new Error('No active plan. Create a plan first using create_plan.');
		}

		const now = new Date();
		const newTasks: Task[] = tasks.map(t => ({
			id: t.id,
			description: t.description,
			status: 'pending' as TaskStatus,
			dependencies: t.dependencies || [],
			createdAt: now,
			updatedAt: now,
		}));

		plan.tasks.push(...newTasks);
		plan.updatedAt = now;
		this._fireIfActive(threadId);

		return plan;
	}

	/**
	 * Gets the current plan with all tasks and statuses
	 */
	getPlanStatus(threadId?: string): Plan | null {
		return this._planFor(threadId);
	}

	/**
	 * Clears the current plan
	 */
	clearPlan(threadId?: string): void {
		this._setPlan(null, threadId);
		this._fireIfActive(threadId);
	}

	/**
	 * Generates a unique plan ID
	 */
	private generatePlanId(): string {
		return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Formats the plan as a markdown checklist
	 */
	formatPlanStatus(plan: Plan): string {
		const completedCount = plan.tasks.filter(t => t.status === 'complete').length;
		const totalCount = plan.tasks.length;

		let output = `## 📋 ${plan.goal}\n`;
		output += `**Progress:** ${completedCount}/${totalCount} tasks completed\n\n`;

		for (const task of plan.tasks) {
			const checkbox = this.getCheckboxForStatus(task.status);
			output += `${checkbox} **${task.id}:** ${task.description}`;

			if (task.status === 'in_progress') {
				output += ` *(in progress)*`;
			} else if (task.status === 'failed') {
				output += ` *(failed)*`;
			} else if (task.status === 'skipped') {
				output += ` *(skipped)*`;
			}

			output += '\n';

			if (task.notes) {
				output += `  - ${task.notes}\n`;
			}

			if (task.status === 'pending' && task.dependencies.length > 0) {
				output += `  - *Depends on: ${task.dependencies.join(', ')}*\n`;
			}
		}

		return output.trim();
	}

	private getCheckboxForStatus(status: TaskStatus): string {
		switch (status) {
			case 'complete': return '- [x]';
			case 'in_progress': return '- [~]';
			case 'failed': return '- [!]';
			case 'skipped': return '- [-]';
			case 'pending': default: return '- [ ]';
		}
	}
}


/**
 * Shared singleton instance — the same instance ToolsService uses for the
 * todo tools, so other browser-layer code (e.g. the implementation-plan
 * approve flow in AgentManagerService) can promote a reviewed plan into
 * todos that the agent then executes via update_todo.
 */
export const planningService = new PlanningService();

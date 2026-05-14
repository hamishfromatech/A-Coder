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
 * Ephemeral in-memory planning service
 * Stores the current plan for the active conversation
 * State is cleared when the IDE is restarted
 */
export class PlanningService {
	private currentPlan: Plan | null = null;
	private readonly _onDidChangePlan = new Emitter<Plan | null>();
	public readonly onDidChangePlan: Event<Plan | null> = this._onDidChangePlan.event;

	/**
	 * Creates a new plan, replacing any existing plan
	 */
	createPlan(goal: string, tasks: Array<{ id: string; description: string; dependencies?: string[] }>): Plan {
		const now = new Date();

		this.currentPlan = {
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

		this._onDidChangePlan.fire(this.currentPlan);
		return this.currentPlan;
	}

	/**
	 * Updates the status of a task in the current plan
	 */
	updateTaskStatus(taskId: TaskId, status: TaskStatus, notes?: string): Task {
		if (!this.currentPlan) {
			throw new Error('No active plan. Create a plan first using create_plan.');
		}

		const task = this.currentPlan.tasks.find(t => t.id === taskId);
		if (!task) {
			throw new Error(`Task with id "${taskId}" not found in current plan. Available task IDs: ${this.currentPlan.tasks.map(t => t.id).join(', ')}`);
		}

		task.status = status;
		task.updatedAt = new Date();
		if (notes) {
			task.notes = notes;
		}

		this.currentPlan.updatedAt = new Date();
		this._onDidChangePlan.fire(this.currentPlan);
		return task;
	}

	/**
	 * Adds new tasks to the current plan
	 */
	addTasksToPlan(tasks: Array<{ id: string; description: string; dependencies?: string[] }>): Plan {
		if (!this.currentPlan) {
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

		this.currentPlan.tasks.push(...newTasks);
		this.currentPlan.updatedAt = now;
		this._onDidChangePlan.fire(this.currentPlan);

		return this.currentPlan;
	}

	/**
	 * Gets the current plan with all tasks and statuses
	 */
	getPlanStatus(): Plan | null {
		return this.currentPlan;
	}

	/**
	 * Clears the current plan
	 */
	clearPlan(): void {
		this.currentPlan = null;
		this._onDidChangePlan.fire(null);
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


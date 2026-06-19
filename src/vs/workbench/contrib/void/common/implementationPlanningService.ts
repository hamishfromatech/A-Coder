/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Implementation Planning Service - Manages AI agent implementation plans with preview functionality
 * Allows the AI to create detailed implementation plans, track step progress, and integrate with walkthrough preview
 */

export type StepId = string;

export type StepStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';

export type Complexity = 'simple' | 'medium' | 'complex';

export interface ImplementationStep {
	id: StepId;
	title: string;
	description: string;
	complexity: Complexity;
	files: string[]; // Files that will be modified/created in this step
	dependencies: StepId[]; // Step IDs that must complete before this step can start
	estimated_time?: number; // Time estimate in minutes
	status: StepStatus;
	notes?: string; // Optional notes about the step (e.g., completion notes, error messages)
	createdAt: Date;
	updatedAt: Date;
}

export interface ImplementationPlan {
	id: string;
	goal: string; // Overall goal of the implementation plan
	steps: ImplementationStep[];
	createdAt: Date;
	updatedAt: Date;
	approved?: boolean; // Whether the user has approved this plan
}

/**
 * Ephemeral in-memory implementation planning service.
 *
 * Plans are stored PER THREAD so that switching conversations does not clobber
 * one thread's plan with another's. Methods take an optional `threadId`; when
 * omitted they operate on the active thread (set via `switchToThread`). The
 * preview/React tab is driven from the tools that call `openContentPreview`, so
 * no change event is needed here.
 *
 * State is cleared when the IDE is restarted.
 */
export class ImplementationPlanningService {
	private plansByThread = new Map<string, ImplementationPlan>();
	private activeThreadId = '__default__';

	/**
	 * Set the active thread.
	 */
	switchToThread(threadId: string): void {
		this.activeThreadId = threadId;
	}

	private _tid(threadId?: string): string {
		return threadId ?? this.activeThreadId;
	}

	private _planFor(threadId?: string): ImplementationPlan | null {
		return this.plansByThread.get(this._tid(threadId)) ?? null;
	}

	/**
	 * Creates a new implementation plan, replacing any existing plan
	 */
	createImplementationPlan(
		goal: string,
		steps: Array<{
			id: string;
			title: string;
			description: string;
			complexity: Complexity;
			files: string[];
			dependencies?: string[];
			estimated_time?: number
		}>,
		threadId?: string
	): ImplementationPlan {
		const now = new Date();

		const plan: ImplementationPlan = {
			id: this.generatePlanId(),
			goal,
			steps: steps.map(s => ({
				...s,
				dependencies: s.dependencies || [],
				status: 'pending' as StepStatus,
				createdAt: now,
				updatedAt: now
			})),
			createdAt: now,
			updatedAt: now,
			approved: false
		};

		this.plansByThread.set(this._tid(threadId), plan);
		return plan;
	}

	/**
	 * Gets the current implementation plan
	 */
	getCurrentPlan(threadId?: string): ImplementationPlan | null {
		return this._planFor(threadId);
	}

	/**
	 * Updates the status of a step in the current plan
	 */
	updateStepStatus(stepId: StepId, status: StepStatus, notes?: string, threadId?: string): ImplementationStep | null {
		const plan = this._planFor(threadId);
		if (!plan) {
			throw new Error('No active implementation plan. Create a plan first using create_implementation_plan.');
		}

		const step = plan.steps.find(s => s.id === stepId);
		if (!step) {
			throw new Error(`Step with ID '${stepId}' not found in current plan.`);
		}

		step.status = status;
		step.notes = notes;
		step.updatedAt = new Date();
		plan.updatedAt = new Date();

		return step;
	}

	/**
	 * Gets the next step that can be executed (all dependencies are complete and status is pending)
	 */
	getNextExecutableStep(threadId?: string): ImplementationStep | null {
		const plan = this._planFor(threadId);
		if (!plan) {
			return null;
		}

		// Find steps that are pending and have all dependencies complete
		const pendingSteps = plan.steps.filter(step => {
			if (step.status !== 'pending') {
				return false;
			}

			// Check if all dependencies are complete
			return step.dependencies.every(depId => {
				const depStep = plan.steps.find(s => s.id === depId);
				return depStep && depStep.status === 'complete';
			});
		});

		// Return the first pending step (maintaining order)
		return pendingSteps[0] || null;
	}

	/**
	 * Gets steps grouped by status
	 */
	getStepsByStatus(threadId?: string): Record<StepStatus, ImplementationStep[]> {
		const plan = this._planFor(threadId);
		if (!plan) {
			return {
				pending: [],
				in_progress: [],
				complete: [],
				failed: [],
				skipped: []
			};
		}

		const grouped: Record<StepStatus, ImplementationStep[]> = {
			pending: [],
			in_progress: [],
			complete: [],
			failed: [],
			skipped: []
		};

		for (const step of plan.steps) {
			grouped[step.status].push(step);
		}

		return grouped;
	}

	/**
	 * Gets a summary of the current plan status
	 */
	getPlanSummary(threadId?: string): string | null {
		const plan = this._planFor(threadId);
		if (!plan) {
			return null;
		}

		const { steps } = plan;
		const completed = steps.filter(s => s.status === 'complete').length;
		const total = steps.length;
		const progress = Math.round((completed / total) * 100);

		const nextStep = this.getNextExecutableStep(threadId);
		const nextStepInfo = nextStep ? `\nNext: ${nextStep.title}` : '';

		return `Implementation Plan: "${plan.goal}"\nProgress: ${completed}/${total} steps (${progress}%)${nextStepInfo}`;
	}

	/**
	 * Approves the current implementation plan for execution
	 */
	approvePlan(threadId?: string): void {
		const plan = this._planFor(threadId);
		if (!plan) {
			throw new Error('No active implementation plan to approve.');
		}

		plan.approved = true;
		plan.updatedAt = new Date();
	}

	/**
	 * Checks if the current plan is approved
	 */
	isPlanApproved(threadId?: string): boolean {
		return this._planFor(threadId)?.approved || false;
	}

	/**
	 * Clears the current plan
	 */
	clearPlan(threadId?: string): void {
		this.plansByThread.delete(this._tid(threadId));
	}

	/**
	 * Generates a unique plan ID
	 */
	private generatePlanId(): string {
		return `impl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}

// Singleton instance for the application
export const implementationPlanningService = new ImplementationPlanningService();

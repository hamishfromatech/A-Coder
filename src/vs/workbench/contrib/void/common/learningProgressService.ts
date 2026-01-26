/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEncryptionService } from '../../../../platform/encryption/common/encryptionService.js';
import { LEARNING_PROGRESS_STORAGE_KEY } from './storageKeys.js';
import {
	GlobalLearningProgress,
	ThreadLearningProgress,
	LessonProgress,
	ExerciseAttempt,
	QuizResult,
	HintUsage,
	Badge,
	defaultGlobalLearningProgress,
	LearningSettings,
} from './voidSettingsTypes.js';

export const ILearningProgressService = createDecorator<ILearningProgressService>('ILearningProgressService');

export interface ILearningProgressService {
	readonly _serviceBrand: undefined;
	readonly state: GlobalLearningProgress;
	readonly onDidChangeState: void;

	getThreadProgress(threadId: string): ThreadLearningProgress | null;
	updateThreadProgress(threadId: string, progress: ThreadLearningProgress): Promise<void>;
	updateLessonProgress(threadId: string, lessonId: string, progress: Partial<LessonProgress>): Promise<void>;
	updateExerciseAttempt(threadId: string, exerciseId: string, attempt: ExerciseAttempt): Promise<void>;
	addQuizResult(threadId: string, result: QuizResult): Promise<void>;
	addHintUsage(threadId: string, hint: HintUsage): Promise<void>;
	updateStreak(threadId: string): Promise<void>;
	unlockBadge(threadId: string, badge: Badge): Promise<void>;
	updateSettings(settings: Partial<LearningSettings>): Promise<void>;
	addBookmark(lessonId: string, sectionId: string): Promise<void>;
	removeBookmark(lessonId: string, sectionId: string): Promise<void>;
	addNote(lessonId: string, sectionId: string, note: string): Promise<void>;
	removeNote(lessonId: string, sectionId: string): Promise<void>;
	getGlobalStats(): GlobalLearningProgress['globalStats'];
}

export class LearningProgressService implements ILearningProgressService {
	readonly _serviceBrand = undefined;
	private _state: GlobalLearningProgress = defaultGlobalLearningProgress;
	private _onDidChangeStateEvent: any = undefined;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IEncryptionService private readonly _encryptionService: IEncryptionService,
	) {
		this._loadState();
	}

	readonly state = this._state;
	get onDidChangeState() { return this._onDidChangeStateEvent; }

	private async _loadState(): Promise<void> {
		try {
			const encryptedState = this._storageService.get(LEARNING_PROGRESS_STORAGE_KEY, StorageScope.APPLICATION);

			if (!encryptedState) {
				this._state = defaultGlobalLearningProgress;
				return;
			}

			const stateStr = await this._encryptionService.decrypt(encryptedState);
			const loadedState = JSON.parse(stateStr) as GlobalLearningProgress;

			// Merge with defaults to handle new fields
			this._state = {
				threads: loadedState.threads || {},
				settings: { ...defaultGlobalLearningProgress.settings, ...loadedState.settings },
				bookmarks: loadedState.bookmarks || {},
				notes: loadedState.notes || {},
				globalStats: { ...defaultGlobalLearningProgress.globalStats, ...loadedState.globalStats },
			};
		} catch (error) {
			console.error('[LearningProgressService] Failed to load state:', error);
			this._state = defaultGlobalLearningProgress;
		}
	}

	private async _saveState(): Promise<void> {
		try {
			const stateStr = JSON.stringify(this._state);
			const encryptedState = await this._encryptionService.encrypt(stateStr);
			this._storageService.store(LEARNING_PROGRESS_STORAGE_KEY, encryptedState, StorageScope.APPLICATION, StorageTarget.USER);
		} catch (error) {
			console.error('[LearningProgressService] Failed to save state:', error);
		}
	}

	getThreadProgress(threadId: string): ThreadLearningProgress | null {
		return this._state.threads[threadId] || null;
	}

	async updateThreadProgress(threadId: string, progress: ThreadLearningProgress): Promise<void> {
		this._state.threads[threadId] = progress;
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async updateLessonProgress(threadId: string, lessonId: string, progressUpdate: Partial<LessonProgress>): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 0,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
		}

		const threadProgress = this._state.threads[threadId];

		if (!threadProgress.lessons[lessonId]) {
			threadProgress.lessons[lessonId] = {
				lessonId,
				title: progressUpdate.title || '',
				completed: false,
				sectionsRead: [],
				exercisesAttempted: {},
				quizResults: [],
				totalScore: 0,
				timeSpent: 0,
				lastAccessed: Date.now(),
			};
		}

		const lessonProgress = threadProgress.lessons[lessonId];
		Object.assign(lessonProgress, progressUpdate);

		// Update global stats if lesson was just completed
		if (progressUpdate.completed && !lessonProgress.completed) {
			this._state.globalStats.totalLessonsCompleted++;
			threadProgress.totalLessonsCompleted++;
		}

		threadProgress.lastUpdated = Date.now();
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async updateExerciseAttempt(threadId: string, exerciseId: string, attempt: ExerciseAttempt): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 0,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
		}

		const threadProgress = this._state.threads[threadId];
		const previousAttempt = threadProgress.exercises[exerciseId];

		threadProgress.exercises[exerciseId] = attempt;

		// Update global stats if exercise was just solved
		if (attempt.solved && (!previousAttempt || !previousAttempt.solved)) {
			this._state.globalStats.totalExercisesSolved++;
			threadProgress.totalExercisesSolved++;
		}

		threadProgress.totalTimeSpent += (attempt.timeSpent - (previousAttempt?.timeSpent || 0));
		this._state.globalStats.totalTimeSpent += (attempt.timeSpent - (previousAttempt?.timeSpent || 0));
		threadProgress.lastUpdated = Date.now();
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async addQuizResult(threadId: string, result: QuizResult): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 0,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
		}

		const threadProgress = this._state.threads[threadId];
		threadProgress.quizzes.push(result);
		this._state.globalStats.totalQuizzesTaken++;
		threadProgress.lastUpdated = Date.now();
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async addHintUsage(threadId: string, hint: HintUsage): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 0,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
		}

		const threadProgress = this._state.threads[threadId];
		threadProgress.hints.push(hint);
		threadProgress.lastUpdated = Date.now();
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async updateStreak(threadId: string): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 1,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
			this._state.globalStats.currentStreak = 1;
			this._state.globalStats.longestStreak = 1;
			this._state.globalStats.lastLearningDate = Date.now();
			await this._saveState();
			return;
		}

		const threadProgress = this._state.threads[threadId];
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayTimestamp = today.getTime();

		const lastLearningDate = this._state.globalStats.lastLearningDate;
		const lastLearningDay = new Date(lastLearningDate);
		lastLearningDay.setHours(0, 0, 0, 0);
		const lastLearningTimestamp = lastLearningDay.getTime();

		const dayDiff = (todayTimestamp - lastLearningTimestamp) / (1000 * 60 * 60 * 24);

		if (dayDiff === 0) {
			// Already learned today
			threadProgress.streakCount = Math.max(threadProgress.streakCount, 1);
		} else if (dayDiff === 1) {
			// Consecutive day
			threadProgress.streakCount++;
			this._state.globalStats.currentStreak = threadProgress.streakCount;
			if (threadProgress.streakCount > this._state.globalStats.longestStreak) {
				this._state.globalStats.longestStreak = threadProgress.streakCount;
			}
		} else {
			// Streak broken
			threadProgress.streakCount = 1;
			this._state.globalStats.currentStreak = 1;
		}

		this._state.globalStats.lastLearningDate = Date.now();
		threadProgress.lastUpdated = Date.now();
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async unlockBadge(threadId: string, badge: Badge): Promise<void> {
		if (!this._state.threads[threadId]) {
			this._state.threads[threadId] = {
				threadId,
				lessons: {},
				exercises: {},
				quizzes: [],
				hints: [],
				streakCount: 0,
				badges: [],
				totalLessonsCompleted: 0,
				totalExercisesSolved: 0,
				totalTimeSpent: 0,
				startDate: Date.now(),
				lastUpdated: Date.now(),
			};
		}

		const threadProgress = this._state.threads[threadId];
		const alreadyHasBadge = threadProgress.badges.some(b => b.id === badge.id);

		if (!alreadyHasBadge) {
			threadProgress.badges.push(badge);
			threadProgress.lastUpdated = Date.now();
			this._state.globalStats.lastUpdated = Date.now();
			await this._saveState();
		}
	}

	async updateSettings(settings: Partial<LearningSettings>): Promise<void> {
		this._state.settings = { ...this._state.settings, ...settings };
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async addBookmark(lessonId: string, sectionId: string): Promise<void> {
		if (!this._state.bookmarks[lessonId]) {
			this._state.bookmarks[lessonId] = [];
		}

		if (!this._state.bookmarks[lessonId].includes(sectionId)) {
			this._state.bookmarks[lessonId].push(sectionId);
			this._state.globalStats.lastUpdated = Date.now();
			await this._saveState();
		}
	}

	async removeBookmark(lessonId: string, sectionId: string): Promise<void> {
		if (this._state.bookmarks[lessonId]) {
			this._state.bookmarks[lessonId] = this._state.bookmarks[lessonId].filter(id => id !== sectionId);
			this._state.globalStats.lastUpdated = Date.now();
			await this._saveState();
		}
	}

	async addNote(lessonId: string, sectionId: string, note: string): Promise<void> {
		if (!this._state.notes[lessonId]) {
			this._state.notes[lessonId] = {};
		}

		this._state.notes[lessonId][sectionId] = note;
		this._state.globalStats.lastUpdated = Date.now();
		await this._saveState();
	}

	async removeNote(lessonId: string, sectionId: string): Promise<void> {
		if (this._state.notes[lessonId]) {
			delete this._state.notes[lessonId][sectionId];
			this._state.globalStats.lastUpdated = Date.now();
			await this._saveState();
		}
	}

	getGlobalStats(): GlobalLearningProgress['globalStats'] {
		return this._state.globalStats;
	}
}

registerSingleton(ILearningProgressService, LearningProgressService, InstantiationType.Eager);
/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Lesson HTML Generator
 *
 * Generates standalone HTML lessons with Tailwind CDN, Prism.js syntax highlighting,
 * and full interactivity. Opens in browser instead of VS Code webview.
 */

export interface LessonSection {
	id: string;
	title: string;
	content: string;
	type: 'objectives' | 'prerequisites' | 'module' | 'project' | 'summary' | 'content';
	order: number;
	exercises?: LessonExercise[];
	quiz?: LessonQuiz;
}

export interface LessonExercise {
	id: string;
	type: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';
	title: string;
	instructions: string;
	initialCode: string;
	language?: string;
	expectedSolution?: string;
	testCases?: ExerciseTestCase[];
	hints?: string[];
}

export interface ExerciseTestCase {
	input?: string;
	expectedOutput?: string;
	description?: string;
}

export interface LessonQuiz {
	id: string;
	title?: string;
	questions: QuizQuestion[];
	passingScore?: number; // Percentage needed to pass (default 70)
}

export interface QuizQuestion {
	id: string;
	type: 'multiple_choice' | 'fill_blank' | 'code_output' | 'true_false';
	question: string;
	options?: string[]; // For multiple_choice
	correctAnswer: string | string[]; // Can be single answer or array for multiple correct
	explanation?: string; // Shown after answering
	code?: string; // Optional code snippet for context
	points?: number; // Default 1
}

export interface LessonData {
	id: string;
	title: string;
	topic?: string;
	description?: string;
	sections: LessonSection[];
	studentLevel?: 'beginner' | 'intermediate' | 'advanced';
	estimatedTime?: string;
}

// Course structure for linked lessons
export interface CourseData {
	id: string;
	title: string;
	description?: string;
	lessons: CourseLesson[];
	instructor?: string;
	difficulty?: 'beginner' | 'intermediate' | 'advanced';
	tags?: string[];
}

export interface CourseLesson {
	id: string;
	title: string;
	description?: string;
	estimatedTime?: string;
	isCompleted?: boolean;
	isLocked?: boolean;
	order: number;
}

export interface LessonTheme {
	primary: string;
	primaryLight: string;
	primaryDark: string;
	accent: string;
	accentLight: string;
	background: string;
	backgroundLight: string;
	surface: string;
	text: string;
	textMuted: string;
	border: string;
}

// Procedural theme generation based on lesson ID
function generateTheme(lessonId: string): LessonTheme {
	// Seeded random from lesson ID
	const seed = lessonId.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
	const random = () => {
		const x = Math.sin(seed + (random.seededOffset++)) * 10000;
		return x - Math.floor(x);
	};
	random.seededOffset = 0;

	// Beautiful color palettes
	const palettes = [
		{ primary: '#6366f1', accent: '#f59e0b' }, // Indigo + Amber
		{ primary: '#8b5cf6', accent: '#10b981' }, // Purple + Emerald
		{ primary: '#ec4899', accent: '#06b6d4' }, // Pink + Cyan
		{ primary: '#14b8a6', accent: '#f97316' }, // Teal + Orange
		{ primary: '#3b82f6', accent: '#ef4444' }, // Blue + Red
		{ primary: '#84cc16', accent: '#a855f7' }, // Lime + Purple
		{ primary: '#f43f5e', accent: '#22d3ee' }, // Rose + Sky
		{ primary: '#0ea5e9', accent: '#fbbf24' }, // Sky + Amber
	];

	const palette = palettes[Math.floor(random() * palettes.length) % palettes.length];

	return {
		primary: palette.primary,
		primaryLight: `${palette.primary}20`,
		primaryDark: `${palette.primary}dd`,
		accent: palette.accent,
		accentLight: `${palette.accent}20`,
		background: '#0f0f0f',
		backgroundLight: '#1a1a1a',
		surface: '#242424',
		text: '#f5f5f5',
		textMuted: '#a1a1a1',
		border: '#333333',
	};
}

// Escape HTML for safety
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Escape for use inside single-quoted JS strings (e.g. onclick='...')
function escapeJs(text: string): string {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

// Convert markdown to HTML (simplified)
function markdownToHtml(markdown: string): string {
	if (!markdown) return '';

	let html = markdown;

	// Code blocks with language
	html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
		const language = lang || 'plaintext';
		const escapedCode = escapeHtml(code.trim());
		return `<pre class="rounded-lg overflow-hidden"><code class="language-${language}">${escapedCode}</code></pre>`;
	});

	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-700/50 text-pink-400 font-mono text-sm">$1</code>');

	// Headers
	html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-6 mb-3">$1</h3>');
	html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-8 mb-4">$1</h2>');
	html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mb-4">$1</h1>');

	// Bold and italic
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');

	// Links
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--primary)] hover:underline" target="_blank" rel="noopener">$1</a>');

	// Lists
	html = html.replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-300">$1</li>');
	html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-gray-300"><span class="text-[var(--primary)] mr-2">$1.</span>$2</li>');

	// Wrap consecutive list items
	html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="space-y-2 my-4">$&</ul>');

	// Blockquotes
	html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-[var(--primary)] pl-4 my-4 text-gray-400 italic">$1</blockquote>');

	// Horizontal rules
	html = html.replace(/^---$/gm, '<hr class="border-t border-gray-700 my-6">');

	// Paragraphs
	html = html.replace(/\n\n/g, '</p><p class="text-gray-300 mb-4">');
	html = `<p class="text-gray-300 mb-4">${html}</p>`;

	return html;
}

// Get section icon SVG
function getSectionIcon(type: string): string {
	const icons: Record<string, string> = {
		objectives: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12" cy="12" r="6" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
		prerequisites: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
		module: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>`,
		project: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.28 2.28a2 2 0 002.2.54l2.48-.74a1 1 0 011.28.66l.74 2.48a2 2 0 00.54 2.2L21 13l-2.28-2.28a2 2 0 00-2.2-.54l-2.48.74a1 1 0 01-1.28-.66l-.74-2.48a2 2 0 00-.54-2.2L14 3z"/></svg>`,
		summary: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
		content: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
	};
	return icons[type] || icons.content;
}

// Get exercise type label
function getExerciseTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		fill_blank: 'Fill in the Blank',
		fix_bug: 'Fix the Bug',
		write_function: 'Write a Function',
		extend_code: 'Extend the Code',
	};
	return labels[type] || 'Exercise';
}

// Generate exercise HTML
function generateExerciseHtml(exercise: LessonExercise, theme: LessonTheme, index: number): string {
	return `
	<div class="exercise-card mt-6 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]" data-exercise-id="${exercise.id}">
		<div class="exercise-header px-4 py-3 bg-gradient-to-r from-[var(--primary)]15 to-transparent border-b border-[var(--border)]">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)]20 text-[var(--accent)] font-bold text-sm">${index + 1}</span>
					<div>
						<h4 class="font-semibold text-white">${escapeHtml(exercise.title || getExerciseTypeLabel(exercise.type))}</h4>
						<span class="text-xs text-[var(--text-muted)] uppercase tracking-wider">${getExerciseTypeLabel(exercise.type)}</span>
					</div>
				</div>
				<div class="exercise-status flex items-center gap-2">
					<span class="status-badge hidden px-2 py-1 rounded-full text-xs font-medium"></span>
				</div>
			</div>
		</div>

		<div class="exercise-content p-4">
			<div class="instructions text-gray-300 mb-4">${markdownToHtml(exercise.instructions)}</div>

			<div class="code-editor-container rounded-lg overflow-hidden border border-[var(--border)]">
				<div class="editor-toolbar flex items-center justify-between px-3 py-2 bg-[var(--background-light)] border-b border-[var(--border)]">
					<span class="text-xs text-[var(--text-muted)] font-mono">${exercise.language || 'typescript'}</span>
					<div class="flex items-center gap-2">
						<button onclick="resetExercise('${escapeJs(exercise.id)}')" class="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors" title="Reset code">
							<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
							Reset
						</button>
						<button onclick="getHint('${escapeJs(exercise.id)}')" class="px-2 py-1 text-xs text-[var(--accent)] hover:text-[var(--accent-light)] transition-colors" title="Get a hint">
							<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
							Hint
						</button>
					</div>
				</div>
				<textarea
					id="editor-${exercise.id}"
					class="code-editor w-full h-48 p-4 bg-[#1e1e1e] text-gray-100 font-mono text-sm resize-none focus:outline-none"
					spellcheck="false"
					data-initial-code="${escapeHtml(exercise.initialCode)}"
					data-language="${exercise.language || 'typescript'}"
				>${escapeHtml(exercise.initialCode)}</textarea>
			</div>

			${exercise.hints && exercise.hints.length > 0 ? `
			<div id="hints-${exercise.id}" class="hints-container hidden mt-4 p-3 rounded-lg bg-[var(--primary-light)] border border-[var(--primary)]30">
				<div class="flex items-start gap-2">
					<svg class="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
					<div class="hint-content text-sm text-gray-300"></div>
				</div>
			</div>
			` : ''}

			<div id="feedback-${exercise.id}" class="feedback-container hidden mt-4 p-3 rounded-lg"></div>

			<div class="flex justify-end gap-3 mt-4">
				<button onclick="runExercise('${escapeJs(exercise.id)}')" class="px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-gray-300 hover:text-white hover:border-gray-500 transition-all text-sm font-medium">
					<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
					Run
				</button>
				<button onclick="submitExercise('${escapeJs(exercise.id)}')" class="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-all text-sm font-medium">
					<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
					Submit
				</button>
			</div>
		</div>
	</div>`;
}

// Generate quiz HTML
function generateQuizHtml(quiz: LessonQuiz, theme: LessonTheme): string {
	const questionsHtml = quiz.questions.map((q, idx) => {
		const questionId = q.id;
		const isMultiple = Array.isArray(q.correctAnswer);

		if (q.type === 'multiple_choice' || q.type === 'true_false') {
			const options = q.type === 'true_false' ? ['True', 'False'] : (q.options || []);
			const optionsHtml = options.map((opt, optIdx) => `
				<label class="quiz-option flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--background-light)] cursor-pointer hover:border-[var(--primary)] transition-all" data-question="${questionId}" data-value="${escapeHtml(opt)}">
					<input type="${isMultiple ? 'checkbox' : 'radio'}" name="quiz-${quiz.id}-q-${questionId}" value="${escapeHtml(opt)}" class="w-4 h-4 text-[var(--primary)] focus:ring-[var(--primary)]">
					<span class="text-gray-200">${escapeHtml(opt)}</span>
				</label>
			`).join('');

			return `
				<div class="quiz-question mb-6" data-question-id="${questionId}" data-question-type="${q.type}" data-correct="${isMultiple ? (q.correctAnswer as string[]).join('|||') : q.correctAnswer}" data-points="${q.points || 1}">
					<div class="flex items-start gap-3 mb-3">
						<span class="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary)] text-white font-bold text-sm flex-shrink-0">${idx + 1}</span>
						<div class="flex-1">
							<p class="text-white font-medium">${markdownToHtml(q.question)}</p>
							${q.code ? `<pre class="mt-2 rounded-lg overflow-hidden"><code class="language-typescript">${escapeHtml(q.code)}</code></pre>` : ''}
						</div>
					</div>
					<div class="space-y-2 ml-10">
						${optionsHtml}
					</div>
					${q.explanation ? `<div class="quiz-explanation hidden mt-3 ml-10 p-3 rounded-lg bg-[var(--background-light)] border border-[var(--border)] text-sm text-gray-300"></div>` : ''}
				</div>
			`;
		} else if (q.type === 'fill_blank') {
			return `
				<div class="quiz-question mb-6" data-question-id="${questionId}" data-question-type="fill_blank" data-correct="${Array.isArray(q.correctAnswer) ? q.correctAnswer.join('|||') : q.correctAnswer}" data-points="${q.points || 1}">
					<div class="flex items-start gap-3 mb-3">
						<span class="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary)] text-white font-bold text-sm flex-shrink-0">${idx + 1}</span>
						<div class="flex-1">
							<p class="text-white font-medium">${markdownToHtml(q.question)}</p>
						</div>
					</div>
					<div class="ml-10">
						<input type="text" name="quiz-${quiz.id}-q-${questionId}" class="quiz-input w-full max-w-md px-4 py-2 rounded-lg bg-[var(--background-light)] border border-[var(--border)] text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] transition-colors" placeholder="Type your answer...">
					</div>
					${q.explanation ? `<div class="quiz-explanation hidden mt-3 ml-10 p-3 rounded-lg bg-[var(--background-light)] border border-[var(--border)] text-sm text-gray-300"></div>` : ''}
				</div>
			`;
		} else if (q.type === 'code_output') {
			return `
				<div class="quiz-question mb-6" data-question-id="${questionId}" data-question-type="code_output" data-correct="${Array.isArray(q.correctAnswer) ? q.correctAnswer.join('|||') : q.correctAnswer}" data-points="${q.points || 1}">
					<div class="flex items-start gap-3 mb-3">
						<span class="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary)] text-white font-bold text-sm flex-shrink-0">${idx + 1}</span>
						<div class="flex-1">
							<p class="text-white font-medium">${markdownToHtml(q.question)}</p>
							${q.code ? `<pre class="mt-3 rounded-lg overflow-hidden"><code class="language-typescript">${escapeHtml(q.code)}</code></pre>` : ''}
						</div>
					</div>
					<div class="ml-10">
						<input type="text" name="quiz-${quiz.id}-q-${questionId}" class="quiz-input w-full max-w-md px-4 py-2 rounded-lg bg-[var(--background-light)] border border-[var(--border)] text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] transition-colors font-mono text-sm" placeholder="What does this output?">
					</div>
					${q.explanation ? `<div class="quiz-explanation hidden mt-3 ml-10 p-3 rounded-lg bg-[var(--background-light)] border border-[var(--border)] text-sm text-gray-300"></div>` : ''}
				</div>
			`;
		}
		return '';
	}).join('');

	return `
	<div class="quiz-container mt-8 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]" data-quiz-id="${quiz.id}">
		<div class="quiz-header px-5 py-4 bg-gradient-to-r from-[var(--accent)]10 to-transparent border-b border-[var(--border)]">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-[var(--accent)]20 flex items-center justify-center">
						<svg class="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
					</div>
					<div>
						<h3 class="text-lg font-semibold text-white">${escapeHtml(quiz.title || 'Knowledge Check')}</h3>
						<p class="text-sm text-[var(--text-muted)]">${quiz.questions.length} question${quiz.questions.length !== 1 ? 's' : ''}</p>
					</div>
				</div>
				<div class="quiz-score hidden">
					<span class="px-3 py-1 rounded-full text-sm font-medium"></span>
				</div>
			</div>
		</div>

		<div class="quiz-content p-5">
			${questionsHtml}

			<div class="flex justify-end gap-3 mt-6">
				<button onclick="checkQuiz('${escapeJs(quiz.id)}')" class="px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-all font-medium">
					<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					Check Answers
				</button>
			</div>
		</div>
	</div>`;
}

// Generate sidebar navigation HTML
function generateSidebarHtml(course: CourseData | undefined, currentLessonId: string, sections: LessonSection[], theme: LessonTheme): string {
	if (!course) return '';

	const courseNav = `
		<div class="course-info mb-6 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
			<div class="flex items-center gap-3 mb-3">
				<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center">
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-white text-sm">${escapeHtml(course.title)}</h3>
					<p class="text-xs text-[var(--text-muted)]">${course.lessons.length} lesson${course.lessons.length !== 1 ? 's' : ''}</p>
				</div>
			</div>
			${course.instructor ? `<p class="text-xs text-[var(--text-muted)]">by ${escapeHtml(course.instructor)}</p>` : ''}
		</div>

		<div class="lessons-list space-y-1">
			${course.lessons.map(lesson => `
				<a href="${lesson.id}.html" class="lesson-link flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${lesson.id === currentLessonId ? 'bg-[var(--primary)]15 text-[var(--primary)]' : 'text-gray-400 hover:text-white hover:bg-[var(--background-light)]'} ${lesson.isLocked ? 'opacity-50 pointer-events-none' : ''}" data-lesson-id="${lesson.id}">
					<span class="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${lesson.isCompleted ? 'bg-emerald-500/20 text-emerald-400' : lesson.id === currentLessonId ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-light)] text-gray-500'}">
						${lesson.isCompleted ? '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : lesson.order}
					</span>
					<span class="flex-1 text-sm truncate">${escapeHtml(lesson.title)}</span>
					${lesson.isLocked ? '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>' : ''}
				</a>
			`).join('')}
		</div>
	`;

	const sectionOutline = `
		<div class="section-outline mt-6 pt-6 border-t border-[var(--border)]">
			<h4 class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3 px-3">On This Page</h4>
			<div class="space-y-1">
				${sections.map(section => `
					<a href="#section-${section.id}" class="section-link flex items-center gap-2 px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-[var(--background-light)] transition-all" data-section-id="${section.id}">
						<span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
						<span class="truncate">${escapeHtml(section.title)}</span>
					</a>
				`).join('')}
			</div>
		</div>
	`;

	return `
	<aside class="sidebar hidden lg:block w-64 flex-shrink-0 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
		<div class="p-4">
			${courseNav}
			${sectionOutline}
		</div>
	</aside>`;
}

// Generate the full HTML document
export function generateLessonHtml(data: LessonData, course?: CourseData): string {
	const theme = generateTheme(data.id);
	const lessonId = data.id;

	return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(data.title)} - A-Coder Lesson</title>

	<!-- Tailwind CSS -->
	<script src="https://cdn.tailwindcss.com"></script>
	<script>
		tailwind.config = {
			darkMode: 'class',
			theme: {
				extend: {
					colors: {
						void: {
							bg: {
								1: '#0f0f0f',
								2: '#1a1a1a',
								3: '#242424',
							},
							fg: {
								1: '#f5f5f5',
								2: '#d4d4d4',
								3: '#a1a1a1',
								4: '#737373',
							},
							accent: '${theme.primary}',
							border: {
								1: '#333333',
								2: '#404040',
							}
						}
					}
				}
			}
		}
	</script>

	<!-- Prism.js for syntax highlighting -->
	<link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-typescript.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-css.min.js"></script>
	<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js"></script>

	<style>
		:root {
			--primary: ${theme.primary};
			--primary-light: ${theme.primaryLight};
			--primary-dark: ${theme.primaryDark};
			--accent: ${theme.accent};
			--accent-light: ${theme.accentLight};
			--background: ${theme.background};
			--background-light: ${theme.backgroundLight};
			--surface: ${theme.surface};
			--text: ${theme.text};
			--text-muted: ${theme.textMuted};
			--border: ${theme.border};
		}

		html {
			scroll-behavior: smooth;
		}

		body {
			background: var(--background);
			color: var(--text);
			font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		}

		/* Custom scrollbar */
		::-webkit-scrollbar {
			width: 8px;
			height: 8px;
		}
		::-webkit-scrollbar-track {
			background: var(--background);
		}
		::-webkit-scrollbar-thumb {
			background: var(--border);
			border-radius: 4px;
		}
		::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		/* Code styling */
		pre[class*="language-"] {
			margin: 0;
			border-radius: 0.5rem;
			font-size: 0.875rem;
		}

		code[class*="language-"] {
			font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
		}

		/* Section animations */
		.section-content {
			max-height: 0;
			overflow: hidden;
			transition: max-height 0.4s ease-out, padding 0.3s ease-out;
		}
		.section-content.expanded {
			max-height: 5000px;
			padding-bottom: 1.5rem;
		}

		/* Progress bar animation */
		@keyframes progress-pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.7; }
		}
		.progress-pulse {
			animation: progress-pulse 2s ease-in-out infinite;
		}

		/* Glow effect */
		.glow {
			box-shadow: 0 0 20px var(--primary-light), 0 0 40px var(--primary-light);
		}

		/* Badge styles */
		.badge-success {
			background: linear-gradient(135deg, #10b981, #059669);
		}
		.badge-warning {
			background: linear-gradient(135deg, #f59e0b, #d97706);
		}
		.badge-error {
			background: linear-gradient(135deg, #ef4444, #dc2626);
		}

		/* Confetti animation */
		@keyframes confetti-fall {
			0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
			100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
		}
		.confetti {
			position: fixed;
			width: 10px;
			height: 10px;
			pointer-events: none;
			animation: confetti-fall 3s ease-out forwards;
		}

		/* Quiz styles */
		.quiz-question.correct .quiz-option:has(input:checked) {
			border-color: #10b981;
			background: rgba(16, 185, 129, 0.1);
		}
		.quiz-question.correct .quiz-option:has(input:checked) span {
			color: #10b981;
		}
		.quiz-question.incorrect .quiz-option:has(input:checked) {
			border-color: #ef4444;
			background: rgba(239, 68, 68, 0.1);
		}
		.quiz-question.incorrect .quiz-option:has(input:checked) span {
			color: #ef4444;
		}
		.quiz-question.correct .quiz-input {
			border-color: #10b981;
			background: rgba(16, 185, 129, 0.1);
		}
		.quiz-question.incorrect .quiz-input {
			border-color: #ef4444;
			background: rgba(239, 68, 68, 0.1);
		}

		/* Sidebar styles */
		.sidebar {
			scrollbar-width: thin;
			scrollbar-color: var(--border) transparent;
		}
		.sidebar::-webkit-scrollbar {
			width: 4px;
		}
		.sidebar::-webkit-scrollbar-track {
			background: transparent;
		}
		.sidebar::-webkit-scrollbar-thumb {
			background: var(--border);
			border-radius: 2px;
		}

		/* Lesson link active state */
		.lesson-link.active {
			background: rgba(var(--primary), 0.1);
			color: var(--primary);
		}

		/* Section link active state */
		.section-link.active {
			color: white;
			background: rgba(255, 255, 255, 0.05);
		}
		.section-link.active span:first-child {
			background: var(--primary);
		}
	</style>
</head>
<body class="min-h-screen bg-void-bg-1">
	<!-- Header -->
	<header class="sticky top-0 z-50 backdrop-blur-xl bg-void-bg-1/90 border-b border-void-border-1">
		<div class="max-w-7xl mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					${course ? `
					<a href="index.html" class="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
						</svg>
					</a>
					<div class="w-px h-6 bg-void-border-1"></div>
					` : ''}
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center shadow-lg shadow-[var(--primary)]20">
						<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
						</svg>
					</div>
					<div>
						<h1 class="text-lg font-bold text-white">${escapeHtml(data.title)}</h1>
						${course ? `<p class="text-xs text-[var(--text-muted)]">${escapeHtml(course.title)}</p>` : ''}
					</div>
				</div>

				<div class="flex items-center gap-3">
					${data.studentLevel ? `
					<span class="px-2 py-1 rounded-md text-xs font-medium bg-[var(--surface)] border border-[var(--border)] text-gray-400">${data.studentLevel}</span>
					` : ''}
					${data.estimatedTime ? `
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-void-bg-2 border border-void-border-1">
						<svg class="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<span class="text-sm text-gray-400">${escapeHtml(data.estimatedTime)}</span>
					</div>
					` : ''}

					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]30">
						<span class="progress-percent text-sm font-medium text-[var(--primary)]">0%</span>
					</div>
				</div>
			</div>

			<!-- Progress bar -->
			<div class="mt-3 h-1 bg-void-bg-3 rounded-full overflow-hidden">
				<div id="global-progress" class="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-500" style="width: 0%"></div>
			</div>
		</div>
	</header>

	<!-- Main content with sidebar -->
	<div class="flex max-w-7xl mx-auto">
		${generateSidebarHtml(course, data.id, data.sections, theme)}

		<main class="flex-1 min-w-0 px-6 py-8 ${course ? 'lg:pl-0' : ''}">
			<!-- Lesson metadata -->
			${data.description ? `
			<div class="mb-6 p-4 rounded-xl bg-void-bg-2 border border-void-border-1">
				<p class="text-gray-300">${markdownToHtml(data.description)}</p>
			</div>
			` : ''}

			<!-- Sections -->
			<div class="space-y-4" id="sections-container">
			${data.sections.map((section, idx) => `
			<section
				class="section-card rounded-xl overflow-hidden border border-void-border-1 bg-void-bg-2"
				data-section-id="${section.id}"
				data-section-order="${section.order}"
			>
				<button
					class="section-header w-full px-5 py-4 flex items-center gap-4 hover:bg-void-bg-3/50 transition-colors text-left"
					onclick="toggleSection('${escapeJs(section.id)}')"
				>
					<div class="flex items-center justify-center w-10 h-10 rounded-xl ${idx === 0 ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)]' : 'bg-void-bg-3'} transition-all">
						<span class="section-icon ${idx === 0 ? 'text-white' : 'text-gray-400'}">
							${getSectionIcon(section.type)}
						</span>
					</div>
					<div class="flex-1 min-w-0">
						<h2 class="text-lg font-semibold text-white truncate">${escapeHtml(section.title)}</h2>
						<span class="text-xs text-[var(--text-muted)] uppercase tracking-wider">${section.type}</span>
					</div>
					<div class="flex items-center gap-3">
						<span class="section-status hidden">
							<svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
							</svg>
						</span>
						<svg class="chevron w-5 h-5 text-gray-400 transition-transform ${idx === 0 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
						</svg>
					</div>
				</button>

				<div class="section-content ${idx === 0 ? 'expanded' : ''} px-5" id="section-${section.id}">
					<div class="content prose prose-invert max-w-none">
						${markdownToHtml(section.content)}
					</div>

					${section.exercises && section.exercises.length > 0 ? `
					<div class="exercises-container mt-6 space-y-4">
						${section.exercises.map((ex, exIdx) => generateExerciseHtml(ex, theme, exIdx)).join('')}
					</div>
					` : ''}

					${section.quiz ? generateQuizHtml(section.quiz, theme) : ''}

					<div class="flex justify-end mt-6">
						<button
								onclick="markSectionComplete('${escapeJs(section.id)}')"
							class="mark-complete-btn px-4 py-2 rounded-lg text-sm font-medium transition-all
								bg-transparent border border-void-border-2 text-gray-400 hover:text-white hover:border-[var(--primary)]
								flex items-center gap-2"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
							<span>Mark Complete</span>
						</button>
					</div>
				</div>
			</section>
			`).join('')}
		</div>

		<!-- Completion celebration -->
		<div id="celebration" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70">
			<div class="text-center p-8 rounded-2xl bg-void-bg-2 border border-void-border-1 shadow-2xl max-w-md">
				<div class="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center glow">
					<svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<h2 class="text-2xl font-bold text-white mb-2">Lesson Complete!</h2>
				<p class="text-gray-400 mb-6">You've mastered this lesson. Keep up the great work!</p>
				<button onclick="closeCelebration()" class="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)] transition-all">
					Continue Learning
				</button>
			</div>
		</div>

		<!-- Lesson Navigation -->
		${course ? `
		<div class="lesson-navigation mt-8 flex items-center justify-between pt-6 border-t border-[var(--border)]">
			${course.lessons.findIndex(l => l.id === lessonId) > 0 ? `
				<a href="${course.lessons[course.lessons.findIndex(l => l.id === lessonId) - 1].id}.html" class="nav-prev flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-gray-300 hover:text-white hover:border-[var(--primary)] transition-all">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
					<span>Previous</span>
				</a>
			` : '<div></div>'}
			${course.lessons.findIndex(l => l.id === lessonId) < course.lessons.length - 1 ? `
				<a href="${course.lessons[course.lessons.findIndex(l => l.id === lessonId) + 1].id}.html" class="nav-next flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-all">
					<span>Next Lesson</span>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
				</a>
			` : '<div></div>'}
		</div>
		` : ''}
		</div>
	</main>
	</div>

	<!-- Footer -->
	<footer class="mt-16 border-t border-void-border-1 py-8">
		<div class="max-w-7xl mx-auto px-6 text-center">
			<p class="text-sm text-gray-500">Generated by A-Coder • ${new Date().toLocaleDateString()}</p>
		</div>
	</footer>

	<script>
		// Lesson state management
		const lessonId = '${lessonId}';
		const lessonData = ${JSON.stringify(data)};
		const courseData = ${course ? JSON.stringify(course) : 'null'};
		const storageKey = \`lesson-progress-\${lessonId}\`;

		// Default state
		const defaultState = {
			sections: {},
			exercises: {},
			quizzes: {},
			timeStarted: Date.now(),
			lastAccessed: Date.now(),
		};

		// Load or initialize state
		function loadState() {
			try {
				const saved = localStorage.getItem(storageKey);
				if (saved) {
					return { ...defaultState, ...JSON.parse(saved) };
				}
			} catch (e) {
				console.error('Failed to load lesson state:', e);
			}
			return { ...defaultState };
		}

		// Save state
		function saveState(state) {
			try {
				localStorage.setItem(storageKey, JSON.stringify({
					...state,
					lastAccessed: Date.now(),
				}));
			} catch (e) {
				console.error('Failed to save lesson state:', e);
			}
		}

		let state = loadState();

		// Initialize sections
		lessonData.sections.forEach(section => {
			if (!state.sections[section.id]) {
				state.sections[section.id] = { completed: false, expanded: false };
			}
		});
		saveState(state);

		// Toggle section expansion
		function toggleSection(sectionId) {
			const section = document.querySelector(\`[data-section-id="\${sectionId}"]\`);
			const content = section.querySelector('.section-content');
			const chevron = section.querySelector('.chevron');

			content.classList.toggle('expanded');
			chevron.classList.toggle('rotate-180');

			state.sections[sectionId].expanded = content.classList.contains('expanded');
			saveState(state);
		}

		// Mark section complete
		function markSectionComplete(sectionId) {
			const section = document.querySelector(\`[data-section-id="\${sectionId}"]\`);
			const content = section.querySelector('.section-content');
			const statusIcon = section.querySelector('.section-status');
			const headerIcon = section.querySelector('.section-icon');
			const button = section.querySelector('.mark-complete-btn');

			// Toggle completion
			const isComplete = !state.sections[sectionId].completed;
			state.sections[sectionId].completed = isComplete;
			saveState(state);

			// Update UI
			if (isComplete) {
				statusIcon.classList.remove('hidden');
				headerIcon.closest('.flex').classList.add('bg-emerald-500/20');
				headerIcon.classList.remove('text-gray-400');
				headerIcon.classList.add('text-emerald-400');
				button.innerHTML = \`
					<svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
					</svg>
					<span class="text-emerald-400">Completed</span>
				\`;
				button.classList.add('border-emerald-500/30', 'bg-emerald-500/10');
			} else {
				statusIcon.classList.add('hidden');
				headerIcon.closest('.flex').classList.remove('bg-emerald-500/20');
				headerIcon.classList.add('text-gray-400');
				headerIcon.classList.remove('text-emerald-400');
				button.innerHTML = \`
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
					<span>Mark Complete</span>
				\`;
				button.classList.remove('border-emerald-500/30', 'bg-emerald-500/10');
			}

			updateProgress();
			checkCompletion();
		}

		// Update progress bar
		function updateProgress() {
			const total = lessonData.sections.length;
			const completed = Object.values(state.sections).filter(s => s.completed).length;
			const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

			document.getElementById('global-progress').style.width = \`\${percent}%\`;
			document.querySelector('.progress-percent').textContent = \`\${percent}%\`;
		}

		// Check if lesson is complete
		function checkCompletion() {
			const total = lessonData.sections.length;
			const completed = Object.values(state.sections).filter(s => s.completed).length;

			if (completed === total && total > 0) {
				showCelebration();
			}
		}

		// Show celebration
		function showCelebration() {
			document.getElementById('celebration').classList.remove('hidden');
			createConfetti();
		}

		// Close celebration
		function closeCelebration() {
			document.getElementById('celebration').classList.add('hidden');
		}

		// Create confetti
		function createConfetti() {
			const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444'];
			for (let i = 0; i < 50; i++) {
				setTimeout(() => {
					const confetti = document.createElement('div');
					confetti.className = 'confetti';
					confetti.style.left = Math.random() * 100 + 'vw';
					confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
					confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
					document.body.appendChild(confetti);
					setTimeout(() => confetti.remove(), 3000);
				}, i * 30);
			}
		}

		// Exercise functions
		function resetExercise(exerciseId) {
			const textarea = document.getElementById(\`editor-\${exerciseId}\`);
			const initialCode = textarea.dataset.initialCode;
			textarea.value = initialCode;
			Prism.highlightAll();
		}

		// Hint system
		let hintLevels = {};
		function getHint(exerciseId) {
			const exercise = lessonData.sections
				.flatMap(s => s.exercises || [])
				.find(e => e.id === exerciseId);

			if (!exercise || !exercise.hints || exercise.hints.length === 0) {
				alert('No hints available for this exercise.');
				return;
			}

			const hintsContainer = document.getElementById(\`hints-\${exerciseId}\`);
			const hintContent = hintsContainer.querySelector('.hint-content');

			// Get current hint level
			const currentLevel = hintLevels[exerciseId] || 0;
			const nextHint = exercise.hints[currentLevel];

			if (nextHint) {
				hintsContainer.classList.remove('hidden');

				// Build hint display with all shown hints
				let hintHtml = '<div class="space-y-2">';
				for (let i = 0; i <= currentLevel && i < exercise.hints.length; i++) {
					hintHtml += \`<p class="\${i === currentLevel ? 'text-white font-medium' : 'text-gray-400'}">
						<span class="text-xs uppercase tracking-wider text-gray-500">Hint \${i + 1}</span><br>
						\${exercise.hints[i]}
					</p>\`;
				}
				hintHtml += '</div>';
				hintContent.innerHTML = hintHtml;

				hintLevels[exerciseId] = currentLevel + 1;
			} else {
				hintContent.innerHTML += '<p class="text-gray-500 mt-2">No more hints available. Try solving it!</p>';
			}
		}

		function runExercise(exerciseId) {
			// In a real implementation, this would execute code
			// For now, just show feedback
			const feedbackContainer = document.getElementById(\`feedback-\${exerciseId}\`);
			feedbackContainer.classList.remove('hidden');
			feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30';
			feedbackContainer.innerHTML = '<p class="text-sm text-blue-400">Code executed successfully. Click Submit to check your answer.</p>';
		}

		function submitExercise(exerciseId) {
			const textarea = document.getElementById(\`editor-\${exerciseId}\`);
			const code = textarea.value;

			// Find the exercise
			const exercise = lessonData.sections
				.flatMap(s => s.exercises || [])
				.find(e => e.id === exerciseId);

			// Check answer (simplified - in reality would need proper validation)
			const feedbackContainer = document.getElementById(\`feedback-\${exerciseId}\`);
			feedbackContainer.classList.remove('hidden');

			// Basic validation: check if code has content
			if (code.trim().length < 5) {
				feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30';
				feedbackContainer.innerHTML = '<p class="text-sm text-red-400">Your solution seems too short. Try adding more code!</p>';
				return;
			}

			// Check against expected solution if provided
			if (exercise && exercise.expectedSolution) {
				const userCode = code.trim().replace(/\\s+/g, ' ');
				const expectedCode = exercise.expectedSolution.trim().replace(/\\s+/g, ' ');
				if (userCode !== expectedCode) {
					// Try normalized comparison
					const normalize = (str) => str.replace(/\\s+/g, ' ').toLowerCase().trim();
					if (normalize(userCode) !== normalize(expectedCode)) {
						feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30';
						feedbackContainer.innerHTML = '<p class="text-sm text-amber-400">⚠ Your code looks good but doesn\\'t match exactly. Double-check your implementation.</p>';
						return;
					}
				}
			}

			// Mark as solved
			state.exercises[exerciseId] = { solved: true, code };
			saveState(state);

			feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30';
			feedbackContainer.innerHTML = '<p class="text-sm text-emerald-400">✓ Great work! Your solution looks good.</p>';

			// Update exercise status
			const exerciseCard = document.querySelector(\`[data-exercise-id="\${exerciseId}"]\`);
			const statusBadge = exerciseCard.querySelector('.status-badge');
			statusBadge.classList.remove('hidden');
			statusBadge.className = 'status-badge px-2 py-1 rounded-full text-xs font-medium badge-success text-white';
			statusBadge.textContent = 'Solved';
		}

		// Quiz functions
		function checkQuiz(quizId) {
			const quizContainer = document.querySelector(\`[data-quiz-id="\${quizId}"]\`);
			const questions = quizContainer.querySelectorAll('.quiz-question');
			let correctCount = 0;
			let totalPoints = 0;

			questions.forEach(question => {
				const questionId = question.dataset.questionId;
				const questionType = question.dataset.questionType;
				const correctAnswer = question.dataset.correct;
				const points = parseInt(question.dataset.points) || 1;
				totalPoints += points;

				let userAnswer = '';
				let isCorrect = false;

				if (questionType === 'multiple_choice' || questionType === 'true_false') {
					const selected = question.querySelectorAll('input:checked');
					if (selected.length > 0) {
						const answers = Array.from(selected).map(input => input.value);
						userAnswer = answers.join('|||');
						const correctAnswers = correctAnswer.split('|||');
						isCorrect = answers.length === correctAnswers.length && answers.every(a => correctAnswers.includes(a));
					}
				} else if (questionType === 'fill_blank' || questionType === 'code_output') {
					const input = question.querySelector('.quiz-input');
					userAnswer = input.value.trim();
					const correctAnswers = correctAnswer.split('|||').map(a => a.trim().toLowerCase());
					isCorrect = correctAnswers.includes(userAnswer.toLowerCase());
				}

				if (isCorrect) {
					correctCount += points;
					question.classList.add('correct');
					question.querySelectorAll('.quiz-option').forEach(opt => {
						opt.classList.remove('hover:border-[var(--primary)]');
					});
				} else {
					question.classList.add('incorrect');
					const explanation = question.querySelector('.quiz-explanation');
					if (explanation) {
						explanation.classList.remove('hidden');
						const questionData = lessonData.sections
							.flatMap(s => s.quiz?.questions || [])
							.find(q => q.id === questionId);
						if (questionData && questionData.explanation) {
							explanation.innerHTML = \`
								<div class="flex items-start gap-2">
									<svg class="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
									</svg>
									<div>
										<p class="font-medium text-white mb-1">Explanation</p>
										<p class="text-gray-300">\${questionData.explanation}</p>
									</div>
								</div>
							\`;
						}
					}
				}
			});

			// Show score
			const scoreContainer = quizContainer.querySelector('.quiz-score');
			const percent = Math.round((correctCount / totalPoints) * 100);
			const passingScore = lessonData.sections.find(s => s.quiz?.id === quizId)?.quiz?.passingScore || 70;
			const passed = percent >= passingScore;

			scoreContainer.classList.remove('hidden');
			const scoreBadge = scoreContainer.querySelector('span');
			scoreBadge.className = \`px-3 py-1 rounded-full text-sm font-medium \${passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}\`;
			scoreBadge.textContent = \`\${correctCount}/\${totalPoints} (\${percent}%)\`;

			// Save quiz state
			state.quizzes[quizId] = { score: percent, passed, completed: true };
			saveState(state);
		}

		// Initialize on load
		document.addEventListener('DOMContentLoaded', () => {
			// Restore state
			Object.entries(state.sections).forEach(([sectionId, sectionState]) => {
				if (sectionState.completed) {
					const section = document.querySelector(\`[data-section-id="\${sectionId}"]\`);
					if (section) {
						const statusIcon = section.querySelector('.section-status');
						const headerIcon = section.querySelector('.section-icon');
						const button = section.querySelector('.mark-complete-btn');

						statusIcon.classList.remove('hidden');
						headerIcon.closest('.flex').classList.add('bg-emerald-500/20');
						headerIcon.classList.add('text-emerald-400');
						headerIcon.classList.remove('text-gray-400');
						button.innerHTML = \`
							<svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
							</svg>
							<span class="text-emerald-400">Completed</span>
						\`;
						button.classList.add('border-emerald-500/30', 'bg-emerald-500/10');
					}
				}

				if (sectionState.expanded) {
					const section = document.querySelector(\`[data-section-id="\${sectionId}"]\`);
					if (section) {
						const content = section.querySelector('.section-content');
						const chevron = section.querySelector('.chevron');
						content.classList.add('expanded');
						chevron.classList.add('rotate-180');
					}
				}
			});

			// Update progress
			updateProgress();

			// Apply syntax highlighting
			Prism.highlightAll();
		});

		// Close celebration on escape
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				closeCelebration();
			}
		});
	</script>
</body>
</html>`;
}

// Generate course index HTML
export function generateCourseIndexHtml(course: CourseData): string {
	const theme = generateTheme(course.id);

	return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(course.title)} - A-Coder Course</title>

	<script src="https://cdn.tailwindcss.com"></script>
	<script>
		tailwind.config = {
			darkMode: 'class',
			theme: {
				extend: {
					colors: {
						void: {
							bg: { 1: '#0f0f0f', 2: '#1a1a1a', 3: '#242424' },
							fg: { 1: '#f5f5f5', 2: '#d4d4d4', 3: '#a1a1a1', 4: '#737373' },
							accent: '${theme.primary}',
							border: { 1: '#333333', 2: '#404040' }
						}
					}
				}
			}
		}
	</script>

	<link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">

	<style>
		:root {
			--primary: ${theme.primary};
			--primary-light: ${theme.primaryLight};
			--primary-dark: ${theme.primaryDark};
			--accent: ${theme.accent};
			--accent-light: ${theme.accentLight};
			--background: ${theme.background};
			--background-light: ${theme.backgroundLight};
			--surface: ${theme.surface};
			--text: ${theme.text};
			--text-muted: ${theme.textMuted};
			--border: ${theme.border};
		}

		html { scroll-behavior: smooth; }

		body {
			background: var(--background);
			color: var(--text);
			font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		}

		::-webkit-scrollbar { width: 8px; height: 8px; }
		::-webkit-scrollbar-track { background: var(--background); }
		::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
		::-webkit-scrollbar-thumb:hover { background: #555; }
	</style>
</head>
<body class="min-h-screen bg-void-bg-1">
	<!-- Header -->
	<header class="sticky top-0 z-50 backdrop-blur-xl bg-void-bg-1/90 border-b border-void-border-1">
		<div class="max-w-5xl mx-auto px-6 py-4">
			<div class="flex items-center gap-4">
				<div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center shadow-lg shadow-[var(--primary)]20">
					<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
					</svg>
				</div>
				<div>
					<h1 class="text-xl font-bold text-white">${escapeHtml(course.title)}</h1>
					${course.description ? `<p class="text-sm text-[var(--text-muted)] mt-1">${escapeHtml(course.description)}</p>` : ''}
				</div>
			</div>

			${course.instructor ? `
			<div class="flex items-center gap-2 mt-3 text-sm text-gray-400">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
				</svg>
				<span>${escapeHtml(course.instructor)}</span>
			</div>
			` : ''}

			${course.difficulty ? `
			<div class="flex items-center gap-3 mt-3">
				<span class="px-2 py-1 rounded-md text-xs font-medium ${
					course.difficulty === 'beginner' ? 'bg-emerald-500/20 text-emerald-400' :
					course.difficulty === 'intermediate' ? 'bg-amber-500/20 text-amber-400' :
					'bg-red-500/20 text-red-400'
				}">${course.difficulty}</span>
				<span class="text-sm text-gray-400">${course.lessons.length} lessons</span>
			</div>
			` : ''}

			${course.tags && course.tags.length > 0 ? `
			<div class="flex flex-wrap gap-2 mt-3">
				${course.tags.map(tag => `
					<span class="px-2 py-0.5 rounded-full text-xs bg-[var(--surface)] border border-[var(--border)] text-gray-400">${escapeHtml(tag)}</span>
				`).join('')}
			</div>
			` : ''}
		</div>
	</header>

	<main class="max-w-5xl mx-auto px-6 py-8">
		<div class="space-y-3">
			${course.lessons.map((lesson, idx) => `
				<a href="${lesson.id}.html" class="lesson-card block rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] transition-all group">
					<div class="p-5 flex items-center gap-4">
						<span class="flex items-center justify-center w-10 h-10 rounded-xl ${lesson.isCompleted ? 'bg-emerald-500/20 text-emerald-400' : lesson.isLocked ? 'bg-gray-700 text-gray-500' : 'bg-[var(--primary)]20 text-[var(--primary)]'} font-bold text-sm flex-shrink-0">
							${lesson.isCompleted ? '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : lesson.isLocked ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>' : idx + 1}
						</span>
						<div class="flex-1 min-w-0">
							<h3 class="font-semibold text-white group-hover:text-[var(--primary)] transition-colors">${escapeHtml(lesson.title)}</h3>
							${lesson.description ? `<p class="text-sm text-gray-400 mt-1 line-clamp-2">${escapeHtml(lesson.description)}</p>` : ''}
						</div>
						${lesson.estimatedTime ? `
						<div class="flex items-center gap-2 text-sm text-gray-400 flex-shrink-0">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<span>${escapeHtml(lesson.estimatedTime)}</span>
						</div>
						` : ''}
						<svg class="w-5 h-5 text-gray-400 group-hover:text-[var(--primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
						</svg>
					</div>
				</a>
			`).join('')}
		</div>
	</main>

	<footer class="mt-16 border-t border-void-border-1 py-8">
		<div class="max-w-5xl mx-auto px-6 text-center">
			<p class="text-sm text-gray-500">Generated by A-Coder • ${new Date().toLocaleDateString()}</p>
		</div>
	</footer>
</body>
</html>`;
}
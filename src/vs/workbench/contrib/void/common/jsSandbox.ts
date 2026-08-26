/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * In-browser JavaScript sandbox for interactive lessons.
 *
 * Student code is executed in a dedicated Web Worker built from a Blob URL:
 * - No access to the lesson page's DOM/localStorage (workers have no `document`)
 * - Infinite loops can be hard-killed with `worker.terminate()`
 * - console.* calls are captured and streamed back as messages
 *
 * The worker source is ONE script — preamble + student code + epilogue.
 * Because it's a single script, top-level let/const/function declarations in
 * the student code share scope with the epilogue, which enables reading
 * variable values back for future behavior-based auto-grading.
 *
 * Threat model: the student runs their own code on their own machine in a
 * local file:// lesson. Workers cannot reach the page's DOM; they can reach
 * the network/storage of the file origin, which holds only the app's own
 * progress data — not a security boundary for this use case.
 */

/** Milliseconds before a run is considered hung and hard-killed. */
export const SANDBOX_TIMEOUT_MS = 3000;

/**
 * Runs before the student code in the same worker script: redirects console.*
 * to postMessage so the page can stream output back. Uses no template
 * literals or backticks of its own so JSON.stringify can embed it safely.
 */
export const WORKER_PREAMBLE = [
	'const __sandboxSend = (m) => { self.postMessage(m); };',
	'const __sandboxFmt = (v) => {',
	'	if (typeof v === "string") return v;',
	'	if (v === null || v === undefined) return String(v);',
	'	if (typeof v === "object") {',
	'		try { return JSON.stringify(v); } catch (e) { return String(v); }',
	'	}',
	'	return String(v);',
	'};',
	// Cap forwarded console output so a runaway loop that also logs (e.g.
	// while(true){console.log("x")}) cannot flood the message channel and
	// saturate the page main thread. The worker keeps its CPU in its own
	// thread (isolated from the page); only the timeout timer can reap it.
	'let __sandboxLogCount = 0;',
	'const __SANDBOX_MAX_LOGS = 200;',
	'for (const __k of ["log", "info", "warn", "error", "debug"]) {',
	'	console[__k] = (...__args) => {',
	'		if (__sandboxLogCount < __SANDBOX_MAX_LOGS) {',
	'			__sandboxLogCount++;',
	'			__sandboxSend({ type: "log", level: __k, text: __args.map(__sandboxFmt).join(" ") });',
	'		}',
	'	};',
	'}',
].join('\n');

/** Runs after the student code (same scope): signals clean completion. */
export const WORKER_EPILOGUE = '__sandboxSend({ type: "done" });';

/** Assembles a complete worker script for a piece of student code. */
export function buildWorkerSource(userCode: string): string {
	return WORKER_PREAMBLE + '\n' + userCode + '\n\n' + WORKER_EPILOGUE;
}

export interface SandboxLogMessage {
	type: 'log';
	level: string;
	text: string;
}

export interface SandboxHandlers {
	/** A console.* line was emitted. */
	onLog?: (message: SandboxLogMessage) => void;
	/** The code finished running without throwing. */
	onDone?: () => void;
	/** The code threw an uncaught error / the worker crashed. */
	onError?: (message: string) => void;
	/** The code exceeded SANDBOX_TIMEOUT_MS. */
	onTimeout?: () => void;
	/** Workers aren't available in this browser/context. */
	onUnsupported?: (error: string) => void;
}

export interface SandboxRunHandle {
	/** Abort execution immediately (used to kill a previous run / infinite loop). */
	stop: () => void;
}

/**
 * Self-contained page-side bootstrap, inlined into the generated lesson HTML
 * (which can't import ES modules). Evaluates to an IIFE that defines
 * `window.__sandboxRun(code, handlers)` and returns a { stop() } handle.
 *
 * The worker preamble/epilogue are embedded as JSON string literals, so this
 * file stays the single source of truth and the inlined script is standalone.
 * The preamble/epilogue contain no backticks, so JSON.stringify + embedding
 * inside a <script> here cannot break the HTML.
 */
export const SANDBOX_PAGE_SCRIPT = `(function () {
	'use strict';
	var PREAMBLE = ${JSON.stringify(WORKER_PREAMBLE)};
	var EPILOGUE = ${JSON.stringify(WORKER_EPILOGUE)};
	var TIMEOUT_MS = ${SANDBOX_TIMEOUT_MS};
	window.__SANDBOX_TIMEOUT_MS = TIMEOUT_MS;

	window.__sandboxRun = function (code, handlers) {
		handlers = handlers || {};
		var worker = null;
		var url = '';
		var timer = 0;
		var graceTimer = 0;
		var settled = false;

		function settle() { settled = true; }

		try {
			var blob = new Blob([PREAMBLE + '\\n' + code + '\\n' + EPILOGUE], { type: 'application/javascript' });
			url = URL.createObjectURL(blob);
			worker = new Worker(url);
		} catch (e) {
			// Worker/Blob unsupported in this context (rare on file:// pages).
			if (handlers.onUnsupported) { handlers.onUnsupported(String(e && e.message || e)); }
			return { stop: function () {} };
		}

		timer = setTimeout(function () {
			settle();
			try { worker.terminate(); } catch (err) {}
			URL.revokeObjectURL(url);
			if (handlers.onTimeout) handlers.onTimeout();
		}, TIMEOUT_MS);

		worker.onmessage = function (event) {
			var m = event.data;
			if (!m || typeof m !== 'object') return;
			if (m.type === 'log' && handlers.onLog) {
				handlers.onLog(m);
			} else if (m.type === 'done') {
				// Clean completion. Give a short grace period so any trailing
				// async logs (setTimeout/print) can arrive, then reap.
				settle();
				clearTimeout(timer);
				if (handlers.onDone) handlers.onDone();
				graceTimer = setTimeout(function () {
					try { worker.terminate(); } catch (err) {}
					URL.revokeObjectURL(url);
				}, 300);
			}
		};

		worker.onerror = function (event) {
			settle();
			clearTimeout(timer);
			try { worker.terminate(); } catch (err) {}
			URL.revokeObjectURL(url);
			if (handlers.onError) {
				handlers.onError(String(event && event.message || 'Unknown error'));
			}
		};

		return {
			stop: function () {
				settle();
				clearTimeout(timer);
				clearTimeout(graceTimer);
				try { worker.terminate(); } catch (err) {}
				URL.revokeObjectURL(url);
			}
		};
	};
})();`;

/**
 * Browser-side exercise runner, inlined into generated lesson HTML via the
 * generator's template literal. Replaces the old stub runExercise() so the Run
 * button actually executes student code through the Web Worker sandbox
 * (window.__sandboxRun, defined by the page bootstrap above) and streams
 * console output back live as it runs. Submit still grades via the LLM.
 *
 * Written with string concatenation (no backticks / no ${ }) on purpose, so it
 * interpolates cleanly into the generator's outer template literal. Glyphs and
 * in-string newlines use String.fromCharCode to stay pure-ASCII and escape-free.
 */
export const SANDBOX_RUN_JS = `const activeSandboxRuns = {};

function runExercise(exerciseId) {
  const textarea = document.getElementById('editor-' + exerciseId);
  const code = textarea.value;
  const exercise = lessonData.sections
    .flatMap(s => s.exercises || [])
    .find(e => e.id === exerciseId);
  const language = ((exercise && exercise.language) || 'typescript').toLowerCase();

  const feedbackContainer = document.getElementById('feedback-' + exerciseId);
  feedbackContainer.classList.remove('hidden');

  // In-browser execution is available for JavaScript only.
  if (!/^(javascript|js|typescript|ts)$/.test(language)) {
    feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30';
    feedbackContainer.innerHTML = '<p class="text-sm text-amber-400">In-browser execution is available for JavaScript only. Your ' + language + ' exercise will still be graded when you click Submit.</p>';
    return;
  }

  // Stop any previous run for this exercise, then start a fresh one.
  if (activeSandboxRuns[exerciseId]) { activeSandboxRuns[exerciseId].stop(); }

  feedbackContainer.className = 'feedback-container mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30';
  feedbackContainer.innerHTML = '<div class="sandbox-run-state text-sm font-medium mb-2 text-blue-400"></div><pre class="sandbox-log font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-gray-200"></pre>';

  const stateEl = feedbackContainer.querySelector('.sandbox-run-state');
  const logEl = feedbackContainer.querySelector('pre.sandbox-log');
  let finished = false;
  let hasOutput = false;

  function finish(kind, label) {
    if (finished) return;
    finished = true;
    const color = kind === 'ok' ? 'text-emerald-400' : kind === 'error' ? 'text-red-400' : 'text-amber-400';
    stateEl.className = 'sandbox-run-state text-sm font-medium mb-2 ' + color;
    stateEl.textContent = label;
  }
  const appendLog = (line) => { hasOutput = true; logEl.textContent += line + String.fromCharCode(10); };

  activeSandboxRuns[exerciseId] = window.__sandboxRun(code, {
    onLog: (m) => appendLog(m.text),
    onDone: () => { if (!hasOutput) { logEl.textContent = '(no console output)'; } finish('ok', String.fromCharCode(0x2713) + ' Finished'); },
    onError: (msg) => { appendLog(msg); finish('error', String.fromCharCode(0x2717) + ' Error'); },
    onTimeout: () => { finish('timeout', String.fromCharCode(0x23f1) + ' Timed out after ' + window.__SANDBOX_TIMEOUT_MS + 'ms ' + String.fromCharCode(0x2014) + ' possible infinite loop.'); },
    onUnsupported: (err) => { finish('error', String.fromCharCode(0x26a0) + ' This browser could not start a code sandbox (' + err + '). Try Chrome, Edge, or Firefox.'); }
  });
}
`;

/**
 * Formats a value the way the worker preamble does (single source of log shape).
 */
function sandboxFmtArg(v: unknown): string {
	if (typeof v === 'string') return v;
	if (v === null || v === undefined) return String(v);
	if (typeof v === 'object') {
		try { return JSON.stringify(v); } catch { return String(v); }
	}
	return String(v);
}

/**
 * In-page JavaScript evaluator for contexts where Web Workers are unavailable
 * (e.g. the VS Code sidebar webview, whose CSP permits 'unsafe-eval' but blocks
 * blob-url workers). Runs student code with a captured console and caught
 * exceptions; returns the captured log lines.
 *
 * Limitations vs the worker sandbox: no hard-kill on infinite loops (sync code
 * can't be interrupted in-page) and no DOM isolation. Acceptable here because
 * students run their own code on their own machine and the webview CSP already
 * allows 'unsafe-eval'. Lessons (which CAN infinite-loop by accident) use the
 * worker path for safe timeout-kill.
 *
 * Synchronous only (no top-level await).
 */
export function runUserCodeInline(code: string): { logs: string[]; error: string | null } {
	const logs: string[] = [];
	const con = {
		log: (...a: unknown[]) => logs.push(a.map(sandboxFmtArg).join(' ')),
		info: (...a: unknown[]) => logs.push(a.map(sandboxFmtArg).join(' ')),
		warn: (...a: unknown[]) => logs.push('[warn] ' + a.map(sandboxFmtArg).join(' ')),
		error: (...a: unknown[]) => logs.push('[error] ' + a.map(sandboxFmtArg).join(' ')),
	};
	const fn = new Function('console', code);
	try {
		fn(con);
		return { logs, error: null };
	} catch (e) {
		return { logs, error: (e instanceof Error ? e.message : String(e)) || String(e) };
	}
}

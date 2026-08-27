/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------
 *
 * Status primitives — the shared chrome for agent activity in the UI.
 *
 * One GlyphSpinner, one StatusDot, one StatusRow, one StatusSection, one
 * ScaffoldRow. Consumers fill the slots; they never re-implement the row
 * container, the spinner, or the collapse. Styling rides the `--void-*`
 * tokens (`void-scaffold-text`, `void-scaffold-meta`, `void-hairline`,
 * `void-row-hover`) — no raw palette colors at call sites.
 *
 * Visual language: flat, not boxed. Activity reads as quiet scaffold lines
 * around the reply; elevation is a hairline, never a nested box.
 */

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

// --- class joiner (no clsx dep in this tree) ---

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// --- GlyphSpinner ---

// Classic braille dot cycle — one cell per frame so every frame fits the
// same 1em monospace box. 10 frames @ 80ms = 800ms per revolution.
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BRAILLE_INTERVAL_MS = 80;
const BREATHE_GLYPH = '⣻';

/**
 * Spinner custom properties read by `.void-glyph-spinner` CSS. Typed so a
 * typo in a property name is a compile error, not a silently dead declaration
 * falling back to the braille defaults.
 */
type GlyphSpinnerVars = React.CSSProperties & {
	'--glyph-spinner-duration': string;
	'--glyph-spinner-frames': number;
};

export type GlyphSpinnerVariant = 'braille' | 'breathe';

/**
 * Terminal-flavored glyph spinner — the transcript's "working" glyph.
 *
 * `braille` scrolls a strip of braille frames entirely on the compositor:
 * every frame is in the DOM from mount and a `steps()` transform animation
 * travels one frame per tick. No JS timer, no per-frame DOM writes.
 * `breathe` pulses a single glyph (for long-running rows where the dot-cycle
 * reads as noise).
 *
 * The outer cell keeps consumer classes untouched, so sizing (`size-3.5`,
 * `text-[0.95rem]`), color, and opacity land on it unchanged.
 */
export const GlyphSpinner = ({
	ariaLabel = 'Loading',
	className,
	variant = 'braille',
	paused = false,
}: {
	ariaLabel?: string;
	className?: string;
	variant?: GlyphSpinnerVariant;
	/** Freeze the strip while the spinner stays mounted through a fade-out. */
	paused?: boolean;
}) => {
	const vars: GlyphSpinnerVars = {
		'--glyph-spinner-duration': `${BRAILLE_FRAMES.length * BRAILLE_INTERVAL_MS}ms`,
		'--glyph-spinner-frames': BRAILLE_FRAMES.length,
	};

	return (
		<span
			aria-label={ariaLabel}
			role='status'
			className={cx('inline-flex items-center justify-center font-mono leading-none tabular-nums', className)}
		>
			{/* Hidden from assistive tech — the accessible name is the label above. */}
			<span aria-hidden={true} className='glyph-spinner' data-paused={paused ? 'true' : undefined}>
				{variant === 'breathe'
					? <span className='glyph-breathe'>{BREATHE_GLYPH}</span>
					: <span className='glyph-spinner__strip' style={vars}>
						{BRAILLE_FRAMES.map((frame, i) => (
							<span className='glyph-spinner__frame' key={`${i}:${frame}`}>{frame}</span>
						))}
					</span>
				}
			</span>
		</span>
	);
};

// --- StatusDot ---

export type StatusTone = 'good' | 'muted' | 'warn' | 'bad';

const TONE_BG: Record<StatusTone, string> = {
	good: 'bg-void-success',
	muted: 'bg-void-fg-3',
	warn: 'bg-void-warning',
	bad: 'bg-void-error',
};

/** Tiny filled dot for status columns. Always 6px; tone sets the color. */
export const StatusDot = ({ tone, className, ...props }: { tone: StatusTone } & React.ComponentProps<'span'>) => {
	return <span aria-hidden={true} className={cx('inline-block size-1.5 shrink-0 rounded-full', TONE_BG[tone], className)} {...props} />;
};

// --- StatusRow ---

/**
 * Shared row chrome for status lists (todos, subagents, background tasks).
 * Fixed height, a leading glyph slot (always filled so rows align), flexible
 * content, and a trailing actions slot revealed on hover/focus. Hover
 * background matches the sidebar. Consumers fill the three slots; they never
 * re-implement the row container.
 */
export const StatusRow = ({
	leading,
	trailing,
	trailingVisible = false,
	onActivate,
	onClick,
	className,
	children,
	...props
}: {
	/** Leading glyph slot (spinner / status dot / dashed ring). */
	leading?: React.ReactNode;
	/** Right-aligned actions, revealed on hover/focus unless `trailingVisible`. */
	trailing?: React.ReactNode;
	trailingVisible?: boolean;
	/** Makes the whole row activatable (cursor-pointer + keyboard a11y). */
	onActivate?: (event: React.MouseEvent | React.KeyboardEvent) => void;
} & React.ComponentProps<'div'>) => {
	const clickable = !!onActivate;
	return (
		<div
			className={cx(
				'group/status-row flex min-h-[24px] items-center gap-2 rounded-md px-1.5 py-1',
				clickable ? 'cursor-pointer hover:bg-void-row-hover' : 'hover:bg-void-row-hover',
				className,
			)}
			onClick={(e) => { onClick?.(e); onActivate?.(e); }}
			onKeyDown={clickable ? (e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate?.(e); }
			} : undefined}
			role={clickable ? 'button' : undefined}
			tabIndex={clickable ? 0 : undefined}
			{...props}
		>
			{leading !== undefined && <span className='flex size-3.5 shrink-0 items-center justify-center'>{leading}</span>}
			<div className='flex min-w-0 flex-1 items-center gap-2'>{children}</div>
			{trailing && (
				<div
					className={cx(
						'flex shrink-0 items-center gap-0.5',
						!trailingVisible && 'opacity-0 group-hover/status-row:opacity-100 group-focus-within/status-row:opacity-100',
					)}
				>
					{trailing}
				</div>
			)}
		</div>
	);
};

// --- Todo glyphs ---

/**
 * Normalized todo/task status. Call sites map their own status strings onto
 * this set (e.g. 'complete'/'completed' → 'complete', 'skipped' → 'skipped').
 */
export type TodoStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped' | 'cancelled';

/**
 * The todo glyph vocabulary — checkbox, not spinner-and-dot: a dashed ring
 * while the item is still open, a live spinner only on the in-progress item,
 * a quiet check once it resolves, a slash when it was cancelled/skipped, and
 * a warning glyph when it failed. Always inside a fixed 14px cell so rows
 * align regardless of state.
 */
export const TodoGlyph = ({ status, className }: { status: TodoStatus; className?: string }) => {
	if (status === 'in_progress') {
		return <GlyphSpinner className='text-[0.85rem] text-void-fg-2' />;
	}
	if (status === 'complete') {
		return (
			<svg className='size-3.5 text-void-success/85' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
				<path d='M21.801 10A10 10 0 1 1 17 3.335' />
				<path d='m9 11 3 3L22 4' />
			</svg>
		);
	}
	if (status === 'failed') {
		return (
			<svg className='size-3.5 text-void-warning' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
				<circle cx='12' cy='12' r='10' />
				<line x1='12' x2='12' y1='8' y2='12' />
				<line x1='12' y1='16' x2='12.01' y2='16' />
			</svg>
		);
	}
	if (status === 'skipped' || status === 'cancelled') {
		return (
			<svg className='size-3.5 text-void-fg-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
				<circle cx='12' cy='12' r='10' />
				<line x1='4.93' y1='4.93' x2='19.07' y2='19.07' />
			</svg>
		);
	}
	// pending — dashed ring, visibly "not started yet"
	return <span aria-hidden={true} className='box-border size-[0.7rem] shrink-0 rounded-full border border-dashed border-void-fg-3/70' />;
};

// --- Widget shell ---

/**
 * Inline transcript widgets — the few tool results that render as a panel the
 * user reads or acts on (a plan, a todo list, a clarify question) rather than
 * as a scaffold line. They share one shell so they cannot drift apart: one
 * radius, one mode-derived fill, no border — the surface reads as a surface
 * on the fill alone.
 */
export const WIDGET_SHELL_CLASS = 'rounded-xl bg-void-bg-2 px-3 py-2.5';

// --- Caret ---

/** Right-pointing caret that rotates open. The one disclosure affordance. */
export const Caret = ({ open, size = 12, className }: { open: boolean; size?: number; className?: string }) => {
	return (
		<ChevronRight
			size={size}
			className={cx('shrink-0 transition-transform duration-150 ease-out', open ? 'rotate-90' : '', className)}
		/>
	);
};

// --- StatusSection ---

/**
 * One collapsible group inside a status stack. Pure chrome — header (caret +
 * icon + label + optional collapsed indicator) + body. The stack supplies the
 * outer card and dividers between groups; this owns only its own collapse.
 */
export const StatusSection = ({
	icon,
	label,
	accessory,
	collapsedIndicator,
	defaultCollapsed = true,
	children,
}: {
	/** Glyph between the caret and the label. */
	icon?: React.ReactNode;
	label: React.ReactNode;
	/** Optional right-aligned action (micro text button / link). */
	accessory?: React.ReactNode;
	/** Inline status shown only while the group is collapsed. */
	collapsedIndicator?: React.ReactNode;
	defaultCollapsed?: boolean;
	children: React.ReactNode;
}) => {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	return (
		<div>
			<div className='flex items-center gap-1 pr-1'>
				<button
					type='button'
					onClick={() => setCollapsed((open) => !open)}
					className='flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs font-normal text-void-scaffold-text transition-colors hover:text-void-fg-2'
				>
					<Caret open={!collapsed} className='text-void-scaffold-meta' />
					{icon && <span className='flex shrink-0 items-center'>{icon}</span>}
					<span className='min-w-0 truncate'>{label}</span>
					{collapsed && collapsedIndicator && <span className='flex shrink-0 items-center'>{collapsedIndicator}</span>}
				</button>
				{accessory && <div className='flex shrink-0 items-center gap-1'>{accessory}</div>}
			</div>
			{!collapsed && <div className='px-1 pb-0.5'>{children}</div>}
		</div>
	);
};

// --- Scaffold lines ---

/**
 * Transcript scaffolding: the quiet lines around the reply that say what the
 * agent DID rather than what it said — tool runs, activity summaries. All
 * render through these two classes so they cannot drift into different greys.
 */
export const SCAFFOLD_LABEL_CLASS = 'text-[13px] leading-[1.45] text-void-scaffold-text';
/** Durations, counts and diff stats trailing a scaffold label. */
export const SCAFFOLD_META_CLASS = 'shrink-0 text-[10px] tabular-nums text-void-scaffold-meta';

/**
 * One scaffold line: a quiet label row with an optional disclosure. The
 * hover pill is a tight content-shaped hit target, not a full-width slab.
 */
export const ScaffoldRow = ({
	children,
	trailing,
	onToggle,
	open = false,
	className,
}: {
	children: React.ReactNode;
	/** Right-side slot that stays in flow (live timer, meta). */
	trailing?: React.ReactNode;
	onToggle?: () => void;
	open?: boolean;
	className?: string;
}) => {
	return (
		<div className={cx('group/scaffold-row relative flex w-full min-w-0 max-w-full items-center', className)}>
			<button
				type='button'
				aria-expanded={onToggle ? open : undefined}
				disabled={!onToggle}
				onClick={onToggle}
				className={cx(
					'flex min-w-0 max-w-fit items-center gap-1.5 rounded-md py-0.5 text-left transition-colors',
					onToggle ? 'cursor-pointer hover:text-void-fg-2 hover:bg-void-row-hover' : 'cursor-default',
				)}
			>
				{children}
				{onToggle && (
					<span className={cx(
						'flex h-[1.45rem] shrink-0 items-center transition-opacity duration-150',
						open ? 'opacity-80' : 'opacity-0 group-hover/scaffold-row:opacity-80',
					)}>
						<Caret open={open} size={12} />
					</span>
				)}
			</button>
			{trailing && <span className='ml-auto flex h-[1.45rem] shrink-0 items-center pl-1.5'>{trailing}</span>}
		</div>
	);
};
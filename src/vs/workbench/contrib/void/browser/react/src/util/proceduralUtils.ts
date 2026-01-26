/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Seeded Random Number Generator - MurmurHash3-based PRNG
class SeededRNG {
	private seed: number;

	constructor(seed: string | number) {
		// Convert string seed to number hash
		if (typeof seed === 'string') {
			this.seed = SeededRNG.hashString(seed);
		} else {
			this.seed = seed >>> 0;
		}
	}

	// Simple hash function for strings
	private static hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}

	// Get next random number between 0 and 1
	public next(): number {
		this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
		return this.seed / 0x7fffffff;
	}

	// Get random integer in range [min, max]
	public nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	// Get random float in range [min, max)
	public nextFloat(min: number, max: number): number {
		return this.next() * (max - min) + min;
	}

	// Pick random element from array
	public pick<T>(arr: T[]): T {
		return arr[Math.floor(this.next() * arr.length)];
	}

	// Pick multiple unique random elements
	public pickMany<T>(arr: T[], count: number): T[] {
		const shuffled = [...arr];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled.slice(0, Math.min(count, arr.length));
	}

	// Shuffle array
	public shuffle<T>(arr: T[]): T[] {
		const shuffled = [...arr];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	// Get random boolean with weighted probability
	public nextBool(probability: number = 0.5): boolean {
		return this.next() < probability;
	}

	// Create new RNG with derived seed (useful for sub-generators)
	public derive(subSeed: string | number): SeededRNG {
		const derivedSeed = this.seed + (typeof subSeed === 'string' ? SeededRNG.hashString(subSeed) : subSeed);
		return new SeededRNG(derivedSeed);
	}
}

// Color generation utilities
export interface HSLColor {
	h: number; // 0-360
	s: number; // 0-100
	l: number; // 0-100
}

export interface ThemeColors {
	primary: string;
	secondary: string;
	accent: string;
	background: string;
	backgroundLight: string;
	backgroundDark: string;
	text: string;
	textMuted: string;
	border: string;
	success: string;
	warning: string;
	error: string;
}

export interface LessonTheme {
	colors: ThemeColors;
	pattern: BackgroundPattern;
	mood: 'calm' | 'energetic' | 'focused' | 'creative';
	animations: AnimationConfig;
}

export type BackgroundPattern = 'none' | 'dots' | 'grid' | 'waves' | 'gradient' | 'circles' | 'lines' | 'triangles';

export interface AnimationConfig {
	type: 'fade' | 'slide' | 'scale' | 'rotate' | 'bounce' | 'elastic';
	duration: number;
	easing: string;
}

// Color generation from seed
export function generateHSLFromSeed(seed: string): HSLColor {
	const rng = new SeededRNG(seed);
	return {
		h: rng.nextFloat(0, 360),
		s: rng.nextFloat(60, 90),
		l: rng.nextFloat(45, 60),
	};
}

export function hslToString(hsl: HSLColor): string {
	return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
}

export function hslToHex(hsl: HSLColor): string {
	const h = hsl.h / 360;
	const s = hsl.s / 100;
	const l = hsl.l / 100;

	let r, g, b;

	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}

	const toHex = (x: number) => {
		const hex = Math.round(x * 255).toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Generate complementary colors
export function generateComplementaryColors(baseHSL: HSLColor): ThemeColors {
	const adjust = (h: number, delta: number) => (h + delta + 360) % 360;

	return {
		primary: hslToHex(baseHSL),
		secondary: hslToHex({ ...baseHSL, h: adjust(baseHSL.h, 180), l: baseHSL.l + 10 }),
		accent: hslToHex({ ...baseHSL, h: adjust(baseHSL.h, 30), s: Math.min(baseHSL.s + 10, 100) }),
		background: hslToHex({ ...baseHSL, l: 95 }),
		backgroundLight: hslToHex({ ...baseHSL, l: 98 }),
		backgroundDark: hslToHex({ ...baseHSL, l: 85 }),
		text: hslToHex({ ...baseHSL, l: 20 }),
		textMuted: hslToHex({ ...baseHSL, l: 50 }),
		border: hslToHex({ ...baseHSL, l: 80 }),
		success: '#22c55e',
		warning: '#f59e0b',
		error: '#ef4444',
	};
}

// Generate color palette for specific moods
export function generateMoodPalette(mood: LessonTheme['mood'], seed: string): HSLColor {
	const rng = new SeededRNG(seed);

	switch (mood) {
		case 'calm':
			// Blues, teals, soft greens
			const calmHues = [180, 200, 220, 210, 195];
			return { h: rng.pick(calmHues), s: rng.nextFloat(40, 70), l: rng.nextFloat(50, 65) };

		case 'energetic':
			// Oranges, reds, warm yellows
			const energeticHues = [30, 15, 45, 20, 10];
			return { h: rng.pick(energeticHues), s: rng.nextFloat(70, 100), l: rng.nextFloat(50, 60) };

		case 'focused':
			// Purples, deep blues, indigos
			const focusedHues = [260, 270, 250, 280, 240];
			return { h: rng.pick(focusedHues), s: rng.nextFloat(50, 80), l: rng.nextFloat(45, 60) };

		case 'creative':
			// Mix of vibrant colors
			const creativeHues = rng.pickMany([300, 340, 280, 320, 0, 45, 120], 3);
			return { h: rng.pick(creativeHues), s: rng.nextFloat(60, 90), l: rng.nextFloat(50, 65) };

		default:
			return { h: rng.nextFloat(0, 360), s: rng.nextFloat(60, 90), l: rng.nextFloat(45, 60) };
	}
}

// Pattern generation
export function generatePatternFromSeed(seed: string): BackgroundPattern {
	const rng = new SeededRNG(seed);
	const patterns: BackgroundPattern[] = ['none', 'dots', 'grid', 'waves', 'gradient', 'circles', 'lines', 'triangles'];
	return rng.pick(patterns);
}

// Animation configuration
export function generateAnimationConfig(seed: string): AnimationConfig {
	const rng = new SeededRNG(seed);
	const types: AnimationConfig['type'][] = ['fade', 'slide', 'scale', 'rotate', 'bounce', 'elastic'];
	return {
		type: rng.pick(types),
		duration: rng.nextFloat(200, 500),
		easing: rng.pick(['ease-out', 'ease-in-out', 'cubic-bezier(0.4, 0, 0.2, 1)', 'cubic-bezier(0.68, -0.55, 0.265, 1.55)']),
	};
}

// Full theme generation
export function generateLessonTheme(lessonId: string, topic?: string): LessonTheme {
	const baseSeed = topic ? `${lessonId}-${topic}` : lessonId;
	const rng = new SeededRNG(baseSeed);

	// Determine mood based on seed
	const moods: LessonTheme['mood'][] = ['calm', 'energetic', 'focused', 'creative'];
	const mood = rng.pick(moods);

	// Generate colors
	const baseHSL = generateMoodPalette(mood, baseSeed);
	const colors = generateComplementaryColors(baseHSL);

	// Generate pattern
	const pattern = generatePatternFromSeed(rng.derive('pattern').nextFloat(0, 1000).toString());

	// Generate animations
	const animations = generateAnimationConfig(rng.derive('anim').nextFloat(0, 1000).toString());

	return {
		colors,
		pattern,
		mood,
		animations,
	};
}

// Border radius variations
export function generateBorderRadius(seed: string): string {
	const rng = new SeededRNG(seed);
	const radius = rng.nextFloat(0, 16);
	return `${radius}px`;
}

// Shadow generation
export function generateShadow(seed: string): string {
	const rng = new SeededRNG(seed);
	const x = rng.nextFloat(-8, 8);
	const y = rng.nextFloat(0, 12);
	const blur = rng.nextFloat(8, 24);
	const spread = rng.nextFloat(-4, 4);
	const opacity = rng.nextFloat(0.05, 0.2);
	return `${x}px ${y}px ${blur}px ${spread}px rgba(0, 0, 0, ${opacity})`;
}

// Gradient generation
export function generateGradient(seed: string, type: 'linear' | 'radial' = 'linear'): string {
	const rng = new SeededRNG(seed);
	const color1 = generateHSLFromSeed(rng.derive('c1').nextFloat(0, 1000).toString());
	const color2 = generateHSLFromSeed(rng.derive('c2').nextFloat(0, 1000).toString());
	const angle = rng.nextFloat(0, 360);

	if (type === 'linear') {
		return `linear-gradient(${angle}deg, ${hslToString(color1)}, ${hslToString(color2)})`;
	} else {
		return `radial-gradient(circle, ${hslToString(color1)}, ${hslToString(color2)})`;
	}
}

// Micro-interaction hover effects
export function generateHoverEffect(seed: string): {
	scale: number;
	translate: string;
	shadow: string;
	brightness: number;
} {
	const rng = new SeededRNG(seed);
	return {
		scale: rng.nextFloat(1.0, 1.05),
		translate: `${rng.nextFloat(-2, 2)}px ${rng.nextFloat(-2, 2)}px`,
		shadow: generateShadow(seed),
		brightness: rng.nextFloat(1, 1.1),
	};
}

// Exercise layout variation
export function generateExerciseLayout(seed: string): {
	type: 'card' | 'list' | 'stacked' | 'grid';
	compact: boolean;
	showDivider: boolean;
	showIcon: boolean;
} {
	const rng = new SeededRNG(seed);
	return {
		type: rng.pick(['card', 'list', 'stacked', 'grid']),
		compact: rng.nextBool(0.3),
		showDivider: rng.nextBool(0.6),
		showIcon: rng.nextBool(0.7),
	};
}

// Code block decorations
export function generateCodeBlockDecoration(seed: string): {
	borderStyle: 'solid' | 'dashed' | 'dotted' | 'none';
	borderWidth: number;
	cornerStyle: 'rounded' | 'sharp' | 'pill';
	showGlow: boolean;
	glowColor?: string;
} {
	const rng = new SeededRNG(seed);
	const borderStyles: ('solid' | 'dashed' | 'dotted' | 'none')[] = ['solid', 'dashed', 'dotted', 'none'];
	const cornerStyles: ('rounded' | 'sharp' | 'pill')[] = ['rounded', 'sharp', 'pill'];

	const showGlow = rng.nextBool(0.4);
	const hsl = generateHSLFromSeed(seed);

	return {
		borderStyle: rng.pick(borderStyles),
		borderWidth: rng.pick([1, 2]),
		cornerStyle: rng.pick(cornerStyles),
		showGlow,
		glowColor: showGlow ? `0 0 20px ${hslToString({ ...hsl, l: 60 })}` : undefined,
	};
}

// Button style variation
export function generateButtonStyle(seed: string): {
	gradient: boolean;
	shadow: boolean;
	borderRadius: string;
	padding: string;
	hoverEffect: 'lift' | 'glow' | 'scale' | 'fill';
} {
	const rng = new SeededRNG(seed);
	return {
		gradient: rng.nextBool(0.5),
		shadow: rng.nextBool(0.6),
		borderRadius: rng.pick(['4px', '8px', '12px', '9999px']),
		padding: rng.pick(['8px 16px', '10px 20px', '12px 24px']),
		hoverEffect: rng.pick(['lift', 'glow', 'scale', 'fill']),
	};
}

// Export the main SeededRNG class
export { SeededRNG };
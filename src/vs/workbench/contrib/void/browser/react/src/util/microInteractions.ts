/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { generateHoverEffect } from './proceduralUtils.js';

// ============================================
// Types
// ============================================

export type HoverEffectType = 'lift' | 'glow' | 'scale' | 'fill' | 'rotate' | 'ripple' | 'magnetic';
export type AnimationType = 'fade' | 'slide' | 'scale' | 'rotate' | 'bounce' | 'elastic' | 'flip';
export type ButtonStyle = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';

export interface HoverEffectConfig {
	type: HoverEffectType;
	scale: number;
	translate: string;
	shadow: string;
	brightness: number;
	duration: number;
	easing: string;
}

export interface MicroInteractionAnimationConfig {
	type: AnimationType;
	duration: number;
	easing: string;
	delay?: number;
	fillMode?: 'forwards' | 'backwards' | 'both' | 'none';
}

export interface ButtonMicroInteractionConfig {
	style: ButtonStyle;
	size: 'small' | 'medium' | 'large';
	gradient: boolean;
	shadow: boolean;
	borderRadius: string;
	hoverEffect: HoverEffectType;
	loadingAnimation?: boolean;
}

// ============================================
// Hover Effects
// ============================================

export function getHoverEffectStyles(config: HoverEffectConfig): React.CSSProperties {
	const { type, scale, translate, shadow, brightness, duration, easing } = config;

	const baseStyles: React.CSSProperties = {
		transition: `all ${duration}ms ${easing}`,
	};

	switch (type) {
		case 'lift':
			return {
				...baseStyles,
				transform: `translateY(-2px) scale(${scale})`,
				boxShadow: shadow,
			};

		case 'glow':
			return {
				...baseStyles,
				boxShadow: `0 0 20px ${shadow.split(')')[0]}, ${shadow}`,
				filter: `brightness(${brightness})`,
			};

		case 'scale':
			return {
				...baseStyles,
				transform: `scale(${scale})`,
			};

		case 'fill':
			return {
				...baseStyles,
				opacity: 1,
				filter: `brightness(${brightness})`,
			};

		case 'rotate':
			return {
				...baseStyles,
				transform: `translate(${translate}) rotate(${scale * 5}deg)`,
			};

		case 'ripple':
			return {
				...baseStyles,
				transform: `scale(${scale})`,
			};

		case 'magnetic':
			return {
				...baseStyles,
				transform: `translate(${translate}) scale(${scale})`,
			};

		default:
			return baseStyles;
	}
}

export function generateHoverEffectConfig(seed: string): HoverEffectConfig {
	const effect = generateHoverEffect(seed);
	const types: HoverEffectType[] = ['lift', 'glow', 'scale', 'fill', 'rotate', 'ripple', 'magnetic'];

	return {
		type: types[Math.floor(Math.random() * types.length)],
		scale: effect.scale,
		translate: effect.translate,
		shadow: effect.shadow,
		brightness: effect.brightness,
		duration: 200,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
	};
}

// ============================================
// Animation Styles
// ============================================

export function getAnimationStyles(config: MicroInteractionAnimationConfig): React.CSSProperties {
	const { type, duration, easing, delay = 0, fillMode = 'forwards' } = config;
	return {
		animation: `${type} ${duration}ms ${easing} ${delay}ms ${fillMode}`,
	};
}

export function getAnimationKeyframes(type: AnimationType): string {
	// Keyframes are injected via injectAnimationKeyframes()
	return type;
}

// ============================================
// Button Styles
// ============================================

export function getButtonStyles(config: ButtonMicroInteractionConfig, theme: any): React.CSSProperties {
	const { style, size, gradient, shadow, borderRadius } = config;
	const { colors } = theme;

	const sizeStyles = {
		small: { padding: '6px 12px', fontSize: '12px' },
		medium: { padding: '8px 16px', fontSize: '14px' },
		large: { padding: '12px 24px', fontSize: '16px' },
	};

	const styleColors = {
		primary: {
			background: gradient ? generateGradientFromColors(colors.primary, colors.accent) : colors.primary,
			color: 'white',
		},
		secondary: {
			background: gradient ? generateGradientFromColors(colors.secondary, colors.primary) : colors.secondary,
			color: colors.text,
		},
		ghost: {
			background: 'transparent',
			color: colors.text,
		},
		outline: {
			background: 'transparent',
			color: colors.primary,
			border: `1px solid ${colors.primary}`,
		},
		danger: {
			background: colors.error,
			color: 'white',
		},
	};

	return {
		...sizeStyles[size],
		...styleColors[style],
		borderRadius,
		boxShadow: shadow ? `0 4px 6px rgba(0, 0, 0, 0.1)` : 'none',
		transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
		cursor: 'pointer',
		fontWeight: 500,
	};
}

function generateGradientFromColors(color1: string, color2: string): string {
	return `linear-gradient(135deg, ${color1}, ${color2})`;
}

// ============================================
// Loading Animations
// ============================================

export function getLoadingSpinnerStyles(size: number = 16, color?: string): React.CSSProperties {
	return {
		width: `${size}px`,
		height: `${size}px`,
		border: `2px solid ${color || 'currentColor'}`,
		borderTopColor: 'transparent',
		borderRadius: '50%',
		animation: 'spin 0.8s linear infinite',
	};
}

export function getLoadingDotsStyles(color?: string): React.CSSProperties {
	return {
		display: 'inline-flex',
		gap: '4px',
	};
}

export function getLoadingDotStyles(index: number, color?: string): React.CSSProperties {
	return {
		width: '8px',
		height: '8px',
		borderRadius: '50%',
		backgroundColor: color || 'currentColor',
		animation: `pulse 1.4s ease-in-out infinite`,
		animationDelay: `${index * 0.2}s`,
	};
}

// ============================================
// Smooth Scroll
// ============================================

export function smoothScrollTo(element: HTMLElement, options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'start' }): void {
	element.scrollIntoView(options);
}

export function smoothScrollBy(offset: number, duration: number = 300): void {
	const start = window.scrollY;
	const startTime = performance.now();

	const animate = (currentTime: number) => {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease out

		window.scrollTo(0, start + offset * easeProgress);

		if (progress < 1) {
			requestAnimationFrame(animate);
		}
	};

	requestAnimationFrame(animate);
}

// ============================================
// Ripple Effect
// ============================================

export interface RippleConfig {
	color?: string;
	duration?: number;
	size?: number;
}

export function createRipple(event: React.MouseEvent<HTMLElement>, config: RippleConfig = {}): void {
	const { color = 'rgba(255, 255, 255, 0.3)', duration = 600 } = config;
	const button = event.currentTarget;

	const circle = document.createElement('span');
	const diameter = Math.max(button.clientWidth, button.clientHeight);
	const radius = diameter / 2;

	const rect = button.getBoundingClientRect();

	circle.style.width = circle.style.height = `${diameter}px`;
	circle.style.left = `${event.clientX - rect.left - radius}px`;
	circle.style.top = `${event.clientY - rect.top - radius}px`;
	circle.style.borderRadius = '50%';
	circle.style.position = 'absolute';
	circle.style.backgroundColor = color;
	circle.style.transform = 'scale(0)';
	circle.style.animation = `ripple ${duration}ms linear`;
	circle.style.pointerEvents = 'none';

	const ripple = button.getElementsByClassName('ripple')[0];
	if (ripple) {
		ripple.remove();
	}

	button.classList.add('ripple');
	button.appendChild(circle);
}

// ============================================
// Magnetic Effect
// ============================================

export interface MagneticConfig {
	strength: number;
	smoothness: number;
}

export function createMagneticEffect(
	element: HTMLElement,
	config: MagneticConfig = { strength: 0.5, smoothness: 0.1 }
): () => void {
	const { strength, smoothness } = config;
	let bounds: DOMRect | undefined;
	let mouseX = 0;
	let mouseY = 0;
	let targetX = 0;
	let targetY = 0;
	let currentX = 0;
	let currentY = 0;
	let animationId: number;

	const update = () => {
		currentX += (targetX - currentX) * smoothness;
		currentY += (targetY - currentY) * smoothness;

		element.style.transform = `translate(${currentX}px, ${currentY}px)`;

		if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
			animationId = requestAnimationFrame(update);
		}
	};

	const onMouseMove = (e: MouseEvent) => {
		if (!bounds) bounds = element.getBoundingClientRect();

		const centerX = bounds.left + bounds.width / 2;
		const centerY = bounds.top + bounds.height / 2;

		mouseX = (e.clientX - centerX) * strength;
		mouseY = (e.clientY - centerY) * strength;

		targetX = mouseX;
		targetY = mouseY;

		cancelAnimationFrame(animationId);
		animationId = requestAnimationFrame(update);
	};

	const onMouseLeave = () => {
		targetX = 0;
		targetY = 0;
		bounds = undefined;

		cancelAnimationFrame(animationId);
		animationId = requestAnimationFrame(update);
	};

	element.addEventListener('mousemove', onMouseMove);
	element.addEventListener('mouseleave', onMouseLeave);

	return () => {
		element.removeEventListener('mousemove', onMouseMove);
		element.removeEventListener('mouseleave', onMouseLeave);
		cancelAnimationFrame(animationId);
	};
}

// ============================================
// Success State Animation
// ============================================

export interface SuccessMicroInteractionAnimationConfig {
	showCheckmark?: boolean;
	showConfetti?: boolean;
	checkmarkColor?: string;
	duration?: number;
}

export function getSuccessAnimationStyles(config: SuccessMicroInteractionAnimationConfig = {}): React.CSSProperties {
	const { showCheckmark = true, duration = 500 } = config;
	return {
		animation: `success-${showCheckmark ? 'check' : 'pulse'} ${duration}ms ease-out`,
	};
}

// ============================================
// Interactive Card Styles
// ============================================

export interface InteractiveCardConfig {
	tilt?: boolean;
	tiltIntensity?: number;
	glow?: boolean;
	glowColor?: string;
	elevation?: number;
	transitionDuration?: number;
}

export function getInteractiveCardStyles(config: InteractiveCardConfig = {}, theme: any): React.CSSProperties {
	const {
		glow = false,
		glowColor,
		elevation = 0,
		transitionDuration = 300,
	} = config;

	const styles: React.CSSProperties = {
		transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
	};

	if (glow) {
		styles.boxShadow = `0 0 20px ${glowColor || theme.colors.primary}40`;
	}

	if (elevation > 0) {
		const shadowIntensities = [
			'none',
			'0 1px 3px rgba(0, 0, 0, 0.1)',
			'0 4px 6px rgba(0, 0, 0, 0.1)',
			'0 10px 15px rgba(0, 0, 0, 0.1)',
		];
		styles.boxShadow = `${styles.boxShadow || ''}, ${shadowIntensities[Math.min(elevation, 3)]}`;
	}

	return styles;
}

// ============================================
// Utility Hooks
// ============================================

export interface UseHoverEffectOptions {
	enterDelay?: number;
	leaveDelay?: number;
	effect?: HoverEffectType;
}

export function useHoverEffect(elementRef: React.RefObject<HTMLElement>, options: UseHoverEffectOptions = {}) {
	const { enterDelay = 0, leaveDelay = 0, effect = 'lift' } = options;
	const [isHovered, setIsHovered] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;

		const handleMouseEnter = () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				setIsHovered(true);
			}, enterDelay);
		};

		const handleMouseLeave = () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				setIsHovered(false);
			}, leaveDelay);
		};

		element.addEventListener('mouseenter', handleMouseEnter);
		element.addEventListener('mouseleave', handleMouseLeave);

		return () => {
			element.removeEventListener('mouseenter', handleMouseEnter);
			element.removeEventListener('mouseleave', handleMouseLeave);
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [elementRef, enterDelay, leaveDelay]);

	const styles = isHovered ? getHoverEffectStyles(generateHoverEffectConfig(effect)) : {};

	return { isHovered, styles };
}

export interface UseRippleEffectOptions {
	color?: string;
	duration?: number;
}

export function useRippleEffect(options: UseRippleEffectOptions = {}) {
	const { color = 'rgba(255, 255, 255, 0.3)', duration = 600 } = options;

	const handleRipple = (event: React.MouseEvent<HTMLElement>) => {
		createRipple(event, { color, duration });
	};

	return { handleRipple };
}

// ============================================
// CSS Animation Keyframes Injection
// ============================================

export function injectAnimationKeyframes() {
	// Check if already injected
	if (document.getElementById('micro-interactions-styles')) return;

	const styleSheet = document.createElement('style');
	styleSheet.id = 'micro-interactions-styles';
	styleSheet.textContent = `
		@keyframes ripple {
			to {
				transform: scale(4);
				opacity: 0;
			}
		}

		@keyframes pulse {
			0%, 100% {
				opacity: 0.4;
				transform: scale(1);
			}
			50% {
				opacity: 1;
				transform: scale(1.2);
			}
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		@keyframes success-check {
			0% {
				transform: scale(0) rotate(-45deg);
				opacity: 0;
			}
			50% {
				transform: scale(1.2) rotate(-45deg);
			}
			100% {
				transform: scale(1) rotate(-45deg);
				opacity: 1;
			}
		}

		@keyframes success-pulse {
			0%, 100% {
				transform: scale(1);
				opacity: 1;
			}
			50% {
				transform: scale(1.1);
				opacity: 0.8;
			}
		}

		@keyframes shimmer {
			0% {
				transform: translateX(-100%);
			}
			100% {
				transform: translateX(100%);
			}
		}

		@keyframes fade-in {
			from {
				opacity: 0;
				transform: translateY(10px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		@keyframes scale-in {
			from {
				opacity: 0;
				transform: scale(0.9);
			}
			to {
				opacity: 1;
				transform: scale(1);
			}
		}

		@keyframes slide-in {
			from {
				opacity: 0;
				transform: translateX(-20px);
			}
			to {
				opacity: 1;
				transform: translateX(0);
			}
		}
	`;

	document.head.appendChild(styleSheet);
}

// Initialize styles on module load
if (typeof document !== 'undefined') {
	injectAnimationKeyframes();
}

export default {
	getHoverEffectStyles,
	generateHoverEffectConfig,
	getAnimationStyles,
	getButtonStyles,
	getLoadingSpinnerStyles,
	getLoadingDotsStyles,
	getLoadingDotStyles,
	smoothScrollTo,
	smoothScrollBy,
	createRipple,
	createMagneticEffect,
	getSuccessAnimationStyles,
	getInteractiveCardStyles,
	useHoverEffect,
	useRippleEffect,
	injectAnimationKeyframes,
};
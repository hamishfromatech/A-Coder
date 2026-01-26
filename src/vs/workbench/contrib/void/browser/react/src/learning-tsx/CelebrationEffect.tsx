/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useLessonTheme } from '../util/LessonThemeProvider.js';

export type CelebrationType = 'burst' | 'spiral' | 'rain' | 'fireworks' | 'confetti' | 'stars' | 'hearts' | 'trophy';

export interface CelebrationEffectProps {
	type: CelebrationType;
	duration?: number;
	intensity?: 'low' | 'medium' | 'high';
	onComplete?: () => void;
	position?: { x: number; y: number };
	size?: { width: number; height: number };
	seed?: string; // For consistent effects
}

// Particle class for physics-based animations
class Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	color: string;
	alpha: number;
	decay: number;
	rotation: number;
	rotationSpeed: number;
	shape: 'circle' | 'square' | 'triangle' | 'star';

	constructor(
		x: number,
		y: number,
		color: string,
		shape: 'circle' | 'square' | 'triangle' | 'star' = 'circle',
		velocityScale = 1
	) {
		this.x = x;
		this.y = y;
		this.size = Math.random() * 8 + 4;
		this.color = color;
		this.alpha = 1;
		this.decay = Math.random() * 0.02 + 0.01;
		this.rotation = Math.random() * Math.PI * 2;
		this.rotationSpeed = (Math.random() - 0.5) * 0.2;
		this.shape = shape;

		const angle = Math.random() * Math.PI * 2;
		const speed = Math.random() * 5 * velocityScale;
		this.vx = Math.cos(angle) * speed;
		this.vy = Math.sin(angle) * speed - 3; // Initial upward velocity
	}

	update(gravity = 0.2): boolean {
		this.x += this.vx;
		this.y += this.vy;
		this.vy += gravity;
		this.alpha -= this.decay;
		this.rotation += this.rotationSpeed;

		return this.alpha > 0;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.rotation);
		ctx.globalAlpha = this.alpha;
		ctx.fillStyle = this.color;

		switch (this.shape) {
			case 'circle':
				ctx.beginPath();
				ctx.arc(0, 0, this.size, 0, Math.PI * 2);
				ctx.fill();
				break;
			case 'square':
				ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
				break;
			case 'triangle':
				ctx.beginPath();
				ctx.moveTo(0, -this.size);
				ctx.lineTo(this.size, this.size);
				ctx.lineTo(-this.size, this.size);
				ctx.closePath();
				ctx.fill();
				break;
			case 'star':
				this.drawStar(ctx, 0, 0, 5, this.size, this.size / 2);
				break;
		}

		ctx.restore();
	}

	private drawStar(
		ctx: CanvasRenderingContext2D,
		cx: number,
		cy: number,
		spikes: number,
		outerRadius: number,
		innerRadius: number
	): void {
		let rot = (Math.PI / 2) * 3;
		let x = cx;
		let y = cy;
		const step = Math.PI / spikes;

		ctx.beginPath();
		ctx.moveTo(cx, cy - outerRadius);

		for (let i = 0; i < spikes; i++) {
			x = cx + Math.cos(rot) * outerRadius;
			y = cy + Math.sin(rot) * outerRadius;
			ctx.lineTo(x, y);
			rot += step;

			x = cx + Math.cos(rot) * innerRadius;
			y = cy + Math.sin(rot) * innerRadius;
			ctx.lineTo(x, y);
			rot += step;
		}

		ctx.lineTo(cx, cy - outerRadius);
		ctx.closePath();
		ctx.fill();
	}
}

// Burst celebration effect
class BurstEffect {
	private particles: Particle[] = [];
	private x: number;
	private y: number;
	private colors: string[];

	constructor(x: number, y: number, colors: string[], intensity: number) {
		this.x = x;
		this.y = y;
		this.colors = colors;

		const particleCount = intensity === 'low' ? 30 : intensity === 'medium' ? 50 : 80;
		const shapes: Array<'circle' | 'square' | 'triangle' | 'star'> = ['circle', 'square', 'triangle', 'star'];

		for (let i = 0; i < particleCount; i++) {
			const color = colors[Math.floor(Math.random() * colors.length)];
			const shape = shapes[Math.floor(Math.random() * shapes.length)];
			this.particles.push(new Particle(x, y, color, shape, intensity === 'high' ? 1.5 : 1));
		}
	}

	update(): boolean {
		this.particles = this.particles.filter(p => p.update(0.3));
		return this.particles.length > 0;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.particles.forEach(p => p.draw(ctx));
	}
}

// Spiral celebration effect
class SpiralEffect {
	private particles: Particle[] = [];
	private angle: number = 0;
	private radius: number = 0;
	private maxRadius: number;
	private colors: string[];
	private centerX: number;
	private centerY: number;
	private particleIndex: number = 0;
	private maxParticles: number;

	constructor(x: number, y: number, colors: string[], intensity: number, size: { width: number; height: number }) {
		this.centerX = x;
		this.centerY = y;
		this.colors = colors;
		this.maxParticles = intensity === 'low' ? 60 : intensity === 'medium' ? 100 : 150;
		this.maxRadius = Math.min(size.width, size.height) / 2 - 20;
	}

	update(): boolean {
		this.angle += 0.15;
		this.radius += 1;

		if (this.radius < this.maxRadius && this.particleIndex < this.maxParticles) {
			const x = this.centerX + Math.cos(this.angle) * this.radius;
			const y = this.centerY + Math.sin(this.angle) * this.radius;
			const color = this.colors[this.particleIndex % this.colors.length];

			const particle = new Particle(x, y, color, 'circle', 0.5);
			particle.vx = Math.cos(this.angle) * 2;
			particle.vy = Math.sin(this.angle) * 2;
			particle.decay = 0.008;

			this.particles.push(particle);
			this.particleIndex++;
		}

		this.particles = this.particles.filter(p => p.update(0.1));
		return this.particles.length > 0 || this.radius < this.maxRadius;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.particles.forEach(p => p.draw(ctx));
	}
}

// Rain celebration effect
class RainEffect {
	private particles: Particle[] = [];
	private colors: string[];
	private width: number;
	private height: number;
	private created: number = 0;
	private maxParticles: number;

	constructor(width: number, height: number, colors: string[], intensity: number) {
		this.width = width;
		this.height = height;
		this.colors = colors;
		this.maxParticles = intensity === 'low' ? 80 : intensity === 'medium' ? 120 : 180;
	}

	update(): boolean {
		// Add new particles
		if (this.created < this.maxParticles && Math.random() > 0.7) {
			const x = Math.random() * this.width;
			const y = -20;
			const color = this.colors[Math.floor(Math.random() * this.colors.length)];
			const particle = new Particle(x, y, color, 'circle', 0.8);
			particle.vy = Math.random() * 3 + 2;
			particle.vx = (Math.random() - 0.5) * 2;
			this.particles.push(particle);
			this.created++;
		}

		this.particles = this.particles.filter(p => {
			p.update(0.15);
			return p.alpha > 0 && p.y < this.height + 20;
		});

		return this.particles.length > 0 || this.created < this.maxParticles;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.particles.forEach(p => p.draw(ctx));
	}
}

// Fireworks celebration effect
class Firework {
	private x: number;
	private y: number;
	private particles: Particle[] = [];
	private exploded: boolean = false;
	private color: string;
	private explosionParticles: Particle[] = [];

	constructor(x: number, y: number, color: string) {
		this.x = x;
		this.y = y;
		this.color = color;

		// Rocket trail
		for (let i = 0; i < 10; i++) {
			const particle = new Particle(x, y - i * 3, color, 'circle', 0.3);
			particle.vy = -3 - Math.random();
			particle.decay = 0.05;
			this.particles.push(particle);
		}
	}

	explode(): void {
		this.exploded = true;

		// Create explosion particles
		for (let i = 0; i < 40; i++) {
			const angle = (i / 40) * Math.PI * 2;
			const speed = Math.random() * 4 + 2;
			const particle = new Particle(this.x, this.y, this.color, 'circle', 1);
			particle.vx = Math.cos(angle) * speed;
			particle.vy = Math.sin(angle) * speed;
			particle.decay = 0.015;
			this.explosionParticles.push(particle);
		}
	}

	update(): boolean {
		if (!this.exploded) {
			this.particles.forEach(p => {
				p.x += p.vx;
				p.y += p.vy;
				p.alpha -= p.decay;
			});

			this.particles = this.particles.filter(p => p.alpha > 0);

			// Explode when particles reach top
			if (this.particles.length === 0 || this.particles[0]?.y < 100) {
				this.explode();
			}
		} else {
			this.explosionParticles.forEach(p => p.update(0.1));
			this.explosionParticles = this.explosionParticles.filter(p => p.alpha > 0);
		}

		return this.particles.length > 0 || this.explosionParticles.length > 0;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.particles.forEach(p => p.draw(ctx));
		this.explosionParticles.forEach(p => p.draw(ctx));
	}
}

class FireworksEffect {
	private fireworks: Firework[] = [];
	private width: number;
	private height: number;
	private colors: string[];
	private created: number = 0;
	private maxFireworks: number;

	constructor(width: number, height: number, colors: string[], intensity: number) {
		this.width = width;
		this.height = height;
		this.colors = colors;
		this.maxFireworks = intensity === 'low' ? 3 : intensity === 'medium' ? 5 : 8;
	}

	update(): boolean {
		// Add new fireworks
		if (this.created < this.maxFireworks && Math.random() > 0.95) {
			const x = this.width * 0.2 + Math.random() * this.width * 0.6;
			const y = this.height;
			const color = this.colors[Math.floor(Math.random() * this.colors.length)];
			this.fireworks.push(new Firework(x, y, color));
			this.created++;
		}

		this.fireworks = this.fireworks.filter(fw => fw.update());
		return this.fireworks.length > 0 || this.created < this.maxFireworks;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.fireworks.forEach(fw => fw.draw(ctx));
	}
}

// Stars celebration effect
class StarsEffect {
	private stars: Array<{ x: number; y: number; size: number; alpha: number; speed: number }> = [];
	private width: number;
	private height: number;
	private color: string;
	private created: number = 0;
	private maxStars: number;

	constructor(width: number, height: number, color: string, intensity: number) {
		this.width = width;
		this.height = height;
		this.color = color;
		this.maxStars = intensity === 'low' ? 20 : intensity === 'medium' ? 40 : 60;
	}

	update(): boolean {
		if (this.created < this.maxStars) {
			this.stars.push({
				x: Math.random() * this.width,
				y: Math.random() * this.height,
				size: Math.random() * 15 + 10,
				alpha: 1,
				speed: Math.random() * 0.03 + 0.02,
			});
			this.created++;
		}

		this.stars.forEach(star => {
			star.alpha -= star.speed;
		});

		this.stars = this.stars.filter(star => star.alpha > 0);
		return this.stars.length > 0 || this.created < this.maxStars;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.stars.forEach(star => {
			ctx.save();
			ctx.globalAlpha = star.alpha;
			ctx.fillStyle = this.color;
			ctx.beginPath();
			ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
			ctx.fill();

			// Glow effect
			ctx.globalAlpha = star.alpha * 0.3;
			ctx.beginPath();
			ctx.arc(star.x, star.y, star.size * 1.5, 0, Math.PI * 2);
			ctx.fill();

			ctx.restore();
		});
	}
}

// Hearts celebration effect
class HeartsEffect {
	private hearts: Array<{ x: number; y: number; size: number; alpha: number; vx: number; vy: number }> = [];
	private width: number;
	private height: number;
	private color: string;
	private created: number = 0;
	private maxHearts: number;

	constructor(width: number, height: number, color: string, intensity: number) {
		this.width = width;
		this.height = height;
		this.color = color;
		this.maxHearts = intensity === 'low' ? 20 : intensity === 'medium' ? 35 : 50;
	}

	update(): boolean {
		if (this.created < this.maxHearts) {
			this.hearts.push({
				x: Math.random() * this.width,
				y: this.height + 20,
				size: Math.random() * 15 + 10,
				alpha: 1,
				vx: (Math.random() - 0.5) * 2,
				vy: -(Math.random() * 3 + 2),
			});
			this.created++;
		}

		this.hearts.forEach(heart => {
			heart.x += heart.vx;
			heart.y += heart.vy;
			heart.vy += 0.02; // Slight gravity
			heart.alpha -= 0.008;
		});

		this.hearts = this.hearts.filter(heart => heart.alpha > 0 && heart.y > -20);
		return this.hearts.length > 0 || this.created < this.maxHearts;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.hearts.forEach(heart => {
			ctx.save();
			ctx.globalAlpha = heart.alpha;
			ctx.fillStyle = this.color;
			ctx.translate(heart.x, heart.y);

			// Draw heart shape
			ctx.beginPath();
			const size = heart.size;
			ctx.moveTo(0, size * 0.3);
			ctx.bezierCurveTo(-size * 0.5, -size * 0.5, -size, size * 0.1, 0, size);
			ctx.bezierCurveTo(size, size * 0.1, size * 0.5, -size * 0.5, 0, size * 0.3);
			ctx.fill();

			ctx.restore();
		});
	}
}

// Trophy celebration effect
class TrophyEffect {
	private particle: { y: number; alpha: number; scale: number } = { y: 0, alpha: 0, scale: 0.5 };
	private sparkle: { particles: Particle[] } = { particles: [] };
	private phase: 'intro' | 'hold' | 'outro' = 'intro';
	private center: { x: number; y: number };
	private color: string;
	private timer: number = 0;

	constructor(x: number, y: number, color: string) {
		this.center = { x, y };
		this.color = color;

		// Create sparkle particles
		for (let i = 0; i < 20; i++) {
			const angle = Math.random() * Math.PI * 2;
			const dist = Math.random() * 50 + 30;
			const px = x + Math.cos(angle) * dist;
			const py = y + Math.sin(angle) * dist;
			this.sparkle.particles.push(new Particle(px, py, color, 'star', 0.5));
		}
	}

	update(): boolean {
		this.timer++;

		if (this.phase === 'intro') {
			this.particle.y = (this.timer / 30) * (this.center.y - 200);
			this.particle.alpha = Math.min(this.timer / 20, 1);
			this.particle.scale = 0.5 + (this.timer / 60) * 0.5;

			if (this.timer >= 30) {
				this.phase = 'hold';
			}
		} else if (this.phase === 'hold') {
			this.sparkle.particles.forEach(p => {
				p.alpha = 0.5 + Math.sin(this.timer * 0.1) * 0.5;
			});

			if (this.timer >= 90) {
				this.phase = 'outro';
			}
		} else if (this.phase === 'outro') {
			this.particle.y += (this.timer - 90) * 0.5;
			this.particle.alpha -= 0.02;
			this.sparkle.particles.forEach(p => {
				p.alpha = Math.max(0, p.alpha - 0.03);
			});

			if (this.particle.alpha <= 0) {
				return false;
			}
		}

		return true;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		// Draw sparkles
		this.sparkle.particles.forEach(p => p.draw(ctx));

		// Draw trophy icon
		ctx.save();
		ctx.globalAlpha = this.particle.alpha;
		ctx.translate(this.center.x, this.particle.y);
		ctx.scale(this.particle.scale, this.particle.scale);
		ctx.fillStyle = this.color;

		// Trophy cup shape
		ctx.beginPath();
		ctx.moveTo(-30, -40);
		ctx.lineTo(-30, 0);
		ctx.quadraticCurveTo(-30, 20, -10, 25);
		ctx.lineTo(-10, 40);
		ctx.lineTo(10, 40);
		ctx.lineTo(10, 25);
		ctx.quadraticCurveTo(30, 20, 30, 0);
		ctx.lineTo(30, -40);
		ctx.closePath();
		ctx.fill();

		// Trophy handles
		ctx.beginPath();
		ctx.moveTo(-30, -30);
		ctx.quadraticCurveTo(-45, -30, -45, -10);
		ctx.quadraticCurveTo(-45, 10, -30, 10);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(30, -30);
		ctx.quadraticCurveTo(45, -30, 45, -10);
		ctx.quadraticCurveTo(45, 10, 30, 10);
		ctx.stroke();

		ctx.restore();
	}
}

// Main Celebration Effect Component
export const CelebrationEffect: React.FC<CelebrationEffectProps> = ({
	type,
	duration = 2000,
	intensity = 'medium',
	onComplete,
	position,
	size = { width: 600, height: 400 },
	seed,
}) => {
	const { theme, getColor } = useLessonTheme();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isActive, setIsActive] = useState(true);
	const animationRef = useRef<number>();

	// Generate colors based on theme
	const colors = useMemo(() => {
		return [
			getColor('accent'),
			getColor('primary'),
			getColor('secondary'),
			getColor('success'),
			'#FFD700', // Gold
			'#FF6B6B', // Coral
			'#4ECDC4', // Teal
		];
	}, [theme, getColor]);

	// Get effect center position
	const getCenter = (): { x: number; y: number } => {
		if (position) return position;
		return { x: size.width / 2, y: size.height / 2 };
	};

	// Create effect based on type
	const createEffect = useCallback(() => {
		const center = getCenter();
		const effectSeed = seed || `${type}-${Date.now()}`;

		switch (type) {
			case 'burst':
				return new BurstEffect(center.x, center.y, colors, intensity);
			case 'spiral':
				return new SpiralEffect(center.x, center.y, colors, intensity, size);
			case 'rain':
				return new RainEffect(size.width, size.height, colors, intensity);
			case 'fireworks':
				return new FireworksEffect(size.width, size.height, colors, intensity);
			case 'confetti':
				return new RainEffect(size.width, size.height, colors, intensity);
			case 'stars':
				return new StarsEffect(size.width, size.height, getColor('accent'), intensity);
			case 'hearts':
				return new HeartsEffect(size.width, size.height, getColor('error'), intensity);
			case 'trophy':
				return new TrophyEffect(center.x, center.y, getColor('warning'));
			default:
				return new BurstEffect(center.x, center.y, colors, intensity);
		}
	}, [type, colors, intensity, size, seed, getCenter, getColor]);

	// Animation loop
	useEffect(() => {
		if (!isActive) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Set canvas size
		canvas.width = size.width;
		canvas.height = size.height;

		const effect = createEffect();
		let animationFrameId: number;

		const animate = (timestamp: number) => {
			// Clear canvas
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Update and draw effect
			const isActive = effect.update();
			effect.draw(ctx);

			if (isActive) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				// Animation complete
				setIsActive(false);
				onComplete?.();
			}
		};

		animationFrameId = requestAnimationFrame(animate);
		animationRef.current = animationFrameId;

		// Cleanup
		return () => {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
			}
		};
	}, [isActive, createEffect, size, onComplete]);

	// Auto-cleanup after duration
	useEffect(() => {
		if (!isActive) return;

		const timeout = setTimeout(() => {
			setIsActive(false);
			onComplete?.();
		}, duration);

		return () => clearTimeout(timeout);
	}, [isActive, duration, onComplete]);

	if (!isActive) return null;

	return (
		<div
			className="celebration-effect fixed inset-0 pointer-events-none z-50"
			style={{ backgroundColor: 'transparent' }}
		>
			<canvas
				ref={canvasRef}
				className="absolute inset-0"
				style={{ width: '100%', height: '100%' }}
			/>
		</div>
	);
};

// Hook to trigger celebration
export const useCelebration = () => {
	const [celebration, setCelebration] = useState<{
		type: CelebrationType;
		duration: number;
		intensity: 'low' | 'medium' | 'high';
	} | null>(null);

	const trigger = (
		type: CelebrationType = 'confetti',
		duration = 2000,
		intensity: 'low' | 'medium' | 'high' = 'medium'
	) => {
		setCelebration({ type, duration, intensity });
	};

	const clear = () => {
		setCelebration(null);
	};

	return {
		celebration,
		trigger,
		clear,
	};
};

export default CelebrationEffect;
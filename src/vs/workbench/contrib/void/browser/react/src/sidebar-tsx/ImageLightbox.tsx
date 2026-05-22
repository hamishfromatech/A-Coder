/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ImageLightboxProps {
	src: string;
	alt?: string;
	isOpen: boolean;
	onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, isOpen, onClose }) => {
	const [isLoaded, setIsLoaded] = useState(false);
	const [scale, setScale] = useState(1);
	const containerRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement>(null);

	const handleClose = useCallback(() => {
		setIsLoaded(false);
		setScale(1);
		onClose();
	}, [onClose]);

	// Close on Escape key
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				handleClose();
			} else if (e.key === '+' || e.key === '=') {
				setScale(s => Math.min(s + 0.25, 4));
			} else if (e.key === '-') {
				setScale(s => Math.max(s - 0.25, 0.5));
			} else if (e.key === '0') {
				setScale(1);
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, handleClose]);

	// Prevent body scroll when open
	useEffect(() => {
		if (!isOpen) return;
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = originalOverflow; };
	}, [isOpen]);

	// Focus trap: focus the close button when opened
	useEffect(() => {
		if (isOpen) {
			const closeBtn = containerRef.current?.querySelector('[data-lightbox-close]') as HTMLElement;
			closeBtn?.focus();
		}
	}, [isOpen]);

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === containerRef.current) {
			handleClose();
		}
	};

	if (!isOpen) return null;

	const content = (
		<div
			ref={containerRef}
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
			onClick={handleBackdropClick}
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
		>
			{/* Close button */}
			<button
				data-lightbox-close
				onClick={handleClose}
				className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
				aria-label="Close image preview"
			>
				<X size={14} />
				<span>Esc</span>
			</button>

			{/* Zoom controls */}
			<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/10">
				<button
					onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
					className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors text-sm"
					aria-label="Zoom out"
				>
					−
				</button>
				<span className="text-xs text-white/60 font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
				<button
					onClick={() => setScale(s => Math.min(s + 0.25, 4))}
					className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors text-sm"
					aria-label="Zoom in"
				>
					+
				</button>
				<button
					onClick={() => setScale(1)}
					className="text-xs text-white/50 hover:text-white/80 px-2 transition-colors"
					aria-label="Reset zoom"
				>
					Reset
				</button>
			</div>

			{/* Image container */}
			<div className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center">
				{!isLoaded && (
					<div className="flex items-center gap-2 text-white/50">
						<div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
						<span className="text-sm">Loading...</span>
					</div>
				)}
				<img
					ref={imgRef}
					src={src}
					alt={alt || 'Preview'}
					className={`max-w-full max-h-[85vh] object-contain rounded-lg transition-opacity duration-300 cursor-zoom-in ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
					style={{
						transform: `scale(${scale})`,
						transition: 'transform 200ms ease-out, opacity 300ms ease-out',
					}}
					onLoad={() => setIsLoaded(true)}
					onError={() => setIsLoaded(true)}
					onClick={() => setScale(s => Math.min(s + 0.5, 4))}
				/>
			</div>

			{/* Hint */}
			<div className="absolute top-4 left-4 text-white/30 text-[10px] pointer-events-none select-none">
				Click image to zoom • +/- to adjust • Esc to close
			</div>
		</div>
	);

	return createPortal(content, document.body);
};

export default ImageLightbox;

/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/* eslint-disable local/code-import-patterns, local/code-amd-node-module, no-restricted-globals */

import { useState, useEffect } from 'react';

interface WindowSize {
	width: number;
	height: number;
}

/**
 * Custom hook to track window dimensions with optional debounce
 */
export const useWindowSize = (debounceMs: number = 100) => {
	const [windowSize, setWindowSize] = useState<WindowSize>({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const handleResize = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(() => {
				setWindowSize({
					width: window.innerWidth,
					height: window.innerHeight,
				});
			}, debounceMs);
		};

		window.addEventListener('resize', handleResize);
		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			window.removeEventListener('resize', handleResize);
		};
	}, [debounceMs]);

	return windowSize;
};
/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useToast, dismissToast } from '../util/services.js';

export interface ToastNotificationProps {
	message?: string;
	type?: 'success' | 'error' | 'info' | 'warning';
	duration?: number;
	onDismiss?: () => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = (props) => {
	const toastFromHook = useToast();
	const toast = toastFromHook || props;

	const [isVisible, setIsVisible] = useState(false);
	const [isExiting, setIsExiting] = useState(false);
	const autoDismissTimerRef = useRef<number | null>(null);
	const exitTimerRef = useRef<number | null>(null);

	const dismiss = () => {
		setIsExiting(true);
		if (autoDismissTimerRef.current) {
			clearTimeout(autoDismissTimerRef.current);
			autoDismissTimerRef.current = null;
		}
		if (exitTimerRef.current) {
			clearTimeout(exitTimerRef.current);
			exitTimerRef.current = null;
		}
		exitTimerRef.current = setTimeout(() => {
			setIsVisible(false);
			setIsExiting(false);
			props.onDismiss?.();
			if (!props.message) {
				dismissToast();
			}
			exitTimerRef.current = null;
		}, 300);
	};

	useEffect(() => {
		if (!toast || !toast.message) return;

		if (exitTimerRef.current) {
			clearTimeout(exitTimerRef.current);
			exitTimerRef.current = null;
		}
		setIsVisible(true);
		setIsExiting(false);

		const duration = toast.duration ?? 4000;
		autoDismissTimerRef.current = setTimeout(() => {
			dismiss();
		}, duration);

		return () => {
			if (autoDismissTimerRef.current) {
				clearTimeout(autoDismissTimerRef.current);
				autoDismissTimerRef.current = null;
			}
		};
	}, [toast]);

	useEffect(() => {
		return () => {
			if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
			if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
		};
	}, []);

	if (!isVisible && !isExiting) {
		return null;
	}

	const message = toast?.message || '';
	const type = toast?.type || 'info';

	return (
		<div
			className={`
				flex items-start gap-3 px-4 py-3 mx-2 mb-2
				bg-void-bg-1 border border-void-border-1 rounded-xl shadow-lg
				transition-all duration-300 ease-out
				${isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
				${type === 'success' ? 'border-l-green-500' : type === 'error' ? 'border-l-red-500' : type === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'}
			`}
			role="alert"
		>
			<div className="flex-1 min-w-0 text-sm text-void-fg-1">
				{message}
			</div>
			<button
				onClick={dismiss}
				className="p-1 text-void-fg-4 hover:text-void-fg-2 flex-shrink-0 transition-colors"
				aria-label="Dismiss notification"
			>
				<X size={14} />
			</button>
		</div>
	);
};

export default ToastNotification;

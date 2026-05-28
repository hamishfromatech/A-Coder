/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { WarningBox } from '../void-settings-tsx/WarningBox.js';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onDismiss?: () => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return {
			hasError: true,
			error
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.setState({
			error,
			errorInfo
		});
	}

	render(): ReactNode {
		if (this.state.hasError && this.state.error) {
			// If a custom fallback is provided, use it
			if (this.props.fallback) {
				return this.props.fallback;
			}

			const errMsg = String(this.state.error);
			const safeMsg = errMsg.length > 180 ? errMsg.slice(0, 180) + '…' : errMsg;
			// Use ErrorDisplay component as the default error UI
			return (
				<WarningBox text={safeMsg} />
				// <ErrorDisplay
				// 	message={safeMsg}
				// 	fullError={this.state.error}
				// 	onDismiss={this.props.onDismiss || null}
				// />
			);
		}

		return this.props.children;
	}
}

export default ErrorBoundary;

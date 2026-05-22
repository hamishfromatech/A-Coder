/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';

const SkeletonPulse = ({ width = '100%', height = '12px', className = '' }: { width?: string | number; height?: string | number; className?: string }) => (
	<div
		className={`bg-void-bg-3 rounded-md animate-pulse ${className}`}
		style={{ width, height, minWidth: typeof width === 'number' ? width : undefined, minHeight: typeof height === 'number' ? height : undefined }}
	/>
);

export const SkeletonMessage = ({ isAssistant = false }: { isAssistant?: boolean }) => {
	// Random widths for natural look
	const widths = [
		'92%', '78%', '84%', '90%', '65%', '88%',
		'75%', '94%', '80%', '85%', '70%', '95%',
	];

	return (
		<div className={`flex gap-3 mb-8 ${isAssistant ? '' : 'flex-row-reverse'}`}>
			{/* Avatar skeleton */}
			<div className="flex-shrink-0">
				<SkeletonPulse width={28} height={28} className="rounded-full" />
			</div>

			{/* Content skeleton */}
			<div className="flex-1 min-w-0 max-w-[90%] space-y-2">
				{/* Header */}
				<div className="flex items-center gap-2 mb-1">
					<SkeletonPulse width={60} height={10} />
					<SkeletonPulse width={40} height={10} />
				</div>

				{/* Message lines */}
				{widths.slice(0, isAssistant ? 6 : 3).map((w, i) => (
					<SkeletonPulse key={i} width={w} height={isAssistant ? 12 : 14} />
				))}

				{/* Action buttons skeleton (assistant only) */}
				{isAssistant && (
					<div className="flex items-center gap-2 pt-2 mt-1">
						<SkeletonPulse width={24} height={18} className="rounded" />
						<SkeletonPulse width={24} height={18} className="rounded" />
						<SkeletonPulse width={24} height={18} className="rounded" />
					</div>
				)}
			</div>
		</div>
	);
};

export const SkeletonMessageList = ({ count = 3 }: { count?: number }) => (
	<div className="px-4 py-6 space-y-4 w-full animate-in fade-in duration-200">
		{<>
			<SkeletonMessage isAssistant={false} />
			<SkeletonMessage isAssistant={true} />
			{count > 2 && <SkeletonMessage isAssistant={false} />}
		</>}
	</div>
);

export default SkeletonMessageList;

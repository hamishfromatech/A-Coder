/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
	icon: LucideIcon;
	label: string;
	value: string | number;
	/** Optional tone class for the value (e.g. 'text-void-accent' for a live stat). */
	tone?: string;
}

/** Flat stat tile — no gradient, no glow. A quiet number over a quiet label;
 *  the dashboard reads as information, not marketing. */
export const StatCard = memo(({ icon: Icon, label, value, tone }: StatCardProps) => {
	return (
		<div className='rounded-xl border border-void-hairline bg-void-bg-2 p-4'>
			<div className='flex items-center gap-2'>
				<Icon className='size-3.5 shrink-0 text-void-fg-3' aria-hidden={true} />
				<span className='text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>{label}</span>
			</div>
			<div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${tone ?? 'text-void-fg-1'}`}>{value}</div>
		</div>
	);
});

StatCard.displayName = 'StatCard';
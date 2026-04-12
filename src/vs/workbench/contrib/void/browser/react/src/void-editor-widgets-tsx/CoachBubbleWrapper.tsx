/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


import { useIsDark } from '../util/services.js';

import '../styles.css'
import { CoachBubble, CoachBubbleProps } from './CoachBubble.js';
import { ProactiveCoachProps } from '../../../../../../contrib/void/browser/proactiveCoachWidget.js';


export const CoachBubbleWrapper = (props: ProactiveCoachProps) => {

	const isDark = useIsDark()

	return <div
		className={`@@void-scope ${isDark ? 'dark' : ''}`}
	>
		<CoachBubble
			observation={props.observation}
			onDismiss={props.onDismiss}
			onDiscuss={props.onDiscuss}
		/>
	</div>
}

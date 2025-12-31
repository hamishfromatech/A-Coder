/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ComputedDiff } from '../../common/editCodeServiceTypes.js';
import { IWebWorkerServerRequestHandler } from '../../../../../base/common/worker/webWorker.js';
import { findDiffs } from './findDiffs.js';

export class DiffWorker implements IWebWorkerServerRequestHandler {
	_requestHandlerBrand: any;

	public async $findDiffs(oldStr: string, newStr: string): Promise<ComputedDiff[]> {
		return findDiffs(oldStr, newStr);
	}
}

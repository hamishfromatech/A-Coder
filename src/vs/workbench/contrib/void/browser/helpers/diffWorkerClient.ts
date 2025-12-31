/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';

import { ComputedDiff } from '../../common/editCodeServiceTypes.js';

import { createWebWorker } from '../../../../../base/browser/webWorkerFactory.js';

import { IWebWorkerClient } from '../../../../../base/common/worker/webWorker.js';

import { FileAccess } from '../../../../../base/common/network.js';

import { DiffWorker } from './diffWorker.js';





export class DiffWorkerClient extends Disposable {

	private _worker: IWebWorkerClient<DiffWorker> | null = null;



	constructor() {

		super();

	}



	private _getWorker(): IWebWorkerClient<DiffWorker> {

		if (!this._worker) {

			this._worker = this._register(createWebWorker<DiffWorker>(

				FileAccess.asBrowserUri('vs/workbench/contrib/void/browser/helpers/diffWorkerMain.js'),

				'VoidDiffWorker'

			));

		}

		return this._worker;

	}



	public async findDiffs(oldStr: string, newStr: string): Promise<ComputedDiff[]> {

		const worker = this._getWorker();

		return worker.proxy.$findDiffs(oldStr, newStr);

	}

}

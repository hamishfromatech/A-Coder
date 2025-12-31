/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { WebWorkerServer } from '../../../../../base/common/worker/webWorker.js';
import { DiffWorker } from './diffWorker.js';

// This is the worker entry point
const server = new WebWorkerServer(
	(msg, transfer) => {
		(self as any).postMessage(msg, transfer);
	},
	() => new DiffWorker()
);

self.onmessage = (e: MessageEvent) => {
	server.onmessage(e.data);
};

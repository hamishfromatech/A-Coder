import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { isMacintosh } from '../../../../base/common/platform.js';

type VoidModelType = {
	model: ITextModel | null;
	editorModel: IResolvedTextEditorModel | null;
};

export interface IVoidModelService {
	readonly _serviceBrand: undefined;
	initializeModel(uri: URI): Promise<void>;
	getModel(uri: URI): VoidModelType;
	getModelFromFsPath(fsPath: string): VoidModelType;
	getModelSafe(uri: URI): Promise<VoidModelType>;
	saveModel(uri: URI): Promise<void>;

}

export const IVoidModelService = createDecorator<IVoidModelService>('voidVoidModelService');

class VoidModelService extends Disposable implements IVoidModelService {
	_serviceBrand: undefined;
	static readonly ID = 'voidVoidModelService';
	private readonly _modelRefOfURI: Map<string, IReference<IResolvedTextEditorModel>> = new Map();
	private readonly MAX_MODELS = isMacintosh ? 10 : 50;

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) {
		super();
	}

	saveModel = async (uri: URI) => {
		await this._textFileService.save(uri, { // we want [our change] -> [save] so it's all treated as one change.
			skipSaveParticipants: true // avoid triggering extensions etc (if they reformat the page, it will add another item to the undo stack)
		})
	}

	initializeModel = async (uri: URI) => {
		try {
			const fsPath = uri.fsPath;
			if (this._modelRefOfURI.has(fsPath)) {
				// Move to end of Map (most recently used)
				const ref = this._modelRefOfURI.get(fsPath)!;
				this._modelRefOfURI.delete(fsPath);
				this._modelRefOfURI.set(fsPath, ref);
				return;
			}

			// Enforce limit
			if (this._modelRefOfURI.size >= this.MAX_MODELS) {
				const oldestKey = this._modelRefOfURI.keys().next().value;
				if (oldestKey) {
					console.log(`[VoidModelService] Disposing oldest model reference: ${oldestKey}`);
					this._modelRefOfURI.get(oldestKey)?.dispose();
					this._modelRefOfURI.delete(oldestKey);
				}
			}

			const editorModelRef = await this._textModelService.createModelReference(uri);
			// Keep a strong reference to prevent disposal
			this._modelRefOfURI.set(fsPath, editorModelRef);
		}
		catch (e) {
			console.log('InitializeModel error:', e)
		}
	};

	getModelFromFsPath = (fsPath: string): VoidModelType => {
		const editorModelRef = this._modelRefOfURI.get(fsPath);
		if (!editorModelRef) {
			return { model: null, editorModel: null };
		}

		// Move to end of Map (most recently used)
		this._modelRefOfURI.delete(fsPath);
		this._modelRefOfURI.set(fsPath, editorModelRef);

		const model = editorModelRef.object.textEditorModel;

		if (!model) {
			return { model: null, editorModel: editorModelRef.object };
		}

		return { model, editorModel: editorModelRef.object };
	};

	getModel = (uri: URI) => {
		return this.getModelFromFsPath(uri.fsPath)
	}


	getModelSafe = async (uri: URI): Promise<VoidModelType> => {
		if (!this._modelRefOfURI.has(uri.fsPath)) await this.initializeModel(uri);
		return this.getModel(uri);

	};

	override dispose() {
		super.dispose();
		for (const ref of this._modelRefOfURI.values()) {
			ref.dispose(); // release reference to allow disposal
		}
		this._modelRefOfURI.clear();
	}
}

registerSingleton(IVoidModelService, VoidModelService, InstantiationType.Eager);

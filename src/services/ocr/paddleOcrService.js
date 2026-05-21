import { readFile } from 'fs/promises';
import sharp from 'sharp';

let paddleInstance = null;

async function loadOptionalOnnxRuntime() {
	try {
		const runtimeImport = new Function('specifier', 'return import(specifier)');
		return await runtimeImport('onnxruntime-node');
	} catch {
		return null;
	}
}

async function createPaddleInstance() {
	if (paddleInstance) return paddleInstance;

	const detModelPath = process.env.PADDLEOCR_DET_MODEL_PATH;
	const recModelPath = process.env.PADDLEOCR_REC_MODEL_PATH;
	const dictPath = process.env.PADDLEOCR_DICT_PATH;
	if (!detModelPath || !recModelPath || !dictPath) {
		return null;
	}

	const ort = await loadOptionalOnnxRuntime();
	if (!ort) return null;

	const { PaddleOcrService } = await import('paddleocr');
	const [detectOnnx, recOnnx, dictText] = await Promise.all([
		readFile(detModelPath),
		readFile(recModelPath),
		readFile(dictPath, 'utf8'),
	]);

	paddleInstance = await PaddleOcrService.createInstance({
		ort,
		detection: {
			modelBuffer: detectOnnx.buffer.slice(
				detectOnnx.byteOffset,
				detectOnnx.byteOffset + detectOnnx.byteLength,
			),
			minimumAreaThreshold: 24,
			textPixelThreshold: 0.55,
			paddingBoxVertical: 0.3,
			paddingBoxHorizontal: 0.5,
		},
		recognition: {
			modelBuffer: recOnnx.buffer.slice(
				recOnnx.byteOffset,
				recOnnx.byteOffset + recOnnx.byteLength,
			),
			charactersDictionary: dictText.split(/\r?\n/).filter(Boolean),
			imageHeight: 48,
		},
	});

	return paddleInstance;
}

function paddleBoxToBlock(item, pageNumber, imageSize) {
	const box = item.box || item.boundingBox || [];
	const points = Array.isArray(box[0]) ? box : [];
	const xs = points.map((point) => Number(point[0] || 0));
	const ys = points.map((point) => Number(point[1] || 0));
	const minX = xs.length ? Math.min(...xs) : 0;
	const maxX = xs.length ? Math.max(...xs) : minX + 1;
	const minY = ys.length ? Math.min(...ys) : 0;
	const maxY = ys.length ? Math.max(...ys) : minY + 1;
	const width = Math.max(1, maxX - minX);
	const height = Math.max(1, maxY - minY);

	return {
		text: String(item.text || item.result?.text || '').trim(),
		confidence: Number(item.confidence || item.score || item.result?.confidence || 0.85),
		bounding_box: { x: minX, y: minY, width, height, page: pageNumber },
		relative_box: {
			x: (minX / imageSize.width) * 100,
			y: (minY / imageSize.height) * 100,
			width: (width / imageSize.width) * 100,
			height: (height / imageSize.height) * 100,
			page: pageNumber,
		},
	};
}

async function runPaddleOcr(image) {
	const service = await createPaddleInstance();
	if (!service) {
		return {
			provider: 'paddleocr',
			unavailable: true,
			reason:
				'PaddleOCR requires local ONNX model paths and onnxruntime-node. Falling back to Tesseract.',
			text: '',
			text_blocks: [],
		};
	}

	const raw = await sharp(image.bytes, { limitInputPixels: false })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const input = {
		data: raw.data,
		width: raw.info.width,
		height: raw.info.height,
	};
	const result = await service.recognize(input, {
		ordering: { sortByReadingOrder: true },
	});
	const processed = service.processRecognition
		? service.processRecognition(result, { lineMergeThresholdRatio: 0.8 })
		: result;
	const items = processed.lines || processed.items || result.items || result || [];
	const imageSize = { width: input.width, height: input.height };
	const textBlocks = (Array.isArray(items) ? items : [])
		.map((item) => paddleBoxToBlock(item, image.pageNumber || 1, imageSize))
		.filter((block) => block.text);

	return {
		provider: 'paddleocr',
		text: processed.text || textBlocks.map((block) => block.text).join('\n'),
		confidence: textBlocks.length
			? textBlocks.reduce((sum, block) => sum + block.confidence, 0) / textBlocks.length
			: 0,
		text_blocks: textBlocks,
		raw: processed,
	};
}

export { runPaddleOcr };

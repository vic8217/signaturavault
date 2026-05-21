import { createWorker } from 'tesseract.js';
import { mkdir } from 'fs/promises';
import path from 'path';

function tesseractBoxToBlock(word, pageNumber, imageSize) {
	const bbox = word.bbox || {};
	const x = Number(bbox.x0 || 0);
	const y = Number(bbox.y0 || 0);
	const width = Math.max(1, Number(bbox.x1 || x) - x);
	const height = Math.max(1, Number(bbox.y1 || y) - y);

	return {
		text: String(word.text || '').trim(),
		confidence: Math.max(0, Math.min(1, Number(word.confidence || 0) / 100)),
		bounding_box: { x, y, width, height, page: pageNumber },
		relative_box: {
			x: (x / imageSize.width) * 100,
			y: (y / imageSize.height) * 100,
			width: (width / imageSize.width) * 100,
			height: (height / imageSize.height) * 100,
			page: pageNumber,
		},
	};
}

function collectWordsFromBlocks(blocks = []) {
	return blocks.flatMap((block) =>
		(block.paragraphs || []).flatMap((paragraph) =>
			(paragraph.lines || []).flatMap((line) => line.words || []),
		),
	);
}

function textLinesToBlocks(text = '', pageNumber, imageSize) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line, index) => ({
			text: line,
			confidence: 0.45,
			bounding_box: {
				x: 0,
				y: index * 32,
				width: imageSize.width,
				height: 24,
				page: pageNumber,
			},
			relative_box: {
				x: 8,
				y: Math.min(92, 8 + index * 7),
				width: 84,
				height: 5,
				page: pageNumber,
			},
		}));
}

async function runTesseractOcr(image, options = {}) {
	const cachePath = path.resolve(
		process.env.TESSERACT_CACHE_PATH || path.join(process.cwd(), 'data/tessdata-cache'),
	);
	const langPath = path.resolve(
		process.env.TESSERACT_LANG_PATH || path.join(process.cwd(), 'data/tessdata'),
	);
	await mkdir(cachePath, { recursive: true });

	const worker = await createWorker(options.language || 'eng', 1, {
		cachePath,
		corePath: path.join(process.cwd(), 'node_modules/tesseract.js-core'),
		gzip: false,
		langPath,
		workerPath: path.join(
			process.cwd(),
			'node_modules/tesseract.js/src/worker-script/node/index.js',
		),
	});
	try {
		await worker.setParameters({
			tessedit_pageseg_mode: options.pageSegMode || '6',
			preserve_interword_spaces: '1',
		});

		const result = await worker.recognize(
			image.filePath || image.bytes,
			{},
			{ text: true, blocks: true },
		);
		const data = result.data || {};
		const imageSize = {
			width: image.width || data.width || 1,
			height: image.height || data.height || 1,
		};
		const pageNumber = image.pageNumber || 1;
		const sourceWords = data.words || collectWordsFromBlocks(data.blocks || []);
		const words = sourceWords
			.map((word) => tesseractBoxToBlock(word, pageNumber, imageSize))
			.filter((word) => word.text);
		const textBlocks = words.length ? words : textLinesToBlocks(data.text, pageNumber, imageSize);

		return {
			provider: 'tesseract',
			text: data.text || words.map((word) => word.text).join(' '),
			confidence: Math.max(0, Math.min(1, Number(data.confidence || 0) / 100)),
			text_blocks: textBlocks,
			raw: {
				confidence: data.confidence,
				blockCount: data.blocks?.length || 0,
				wordCount: sourceWords.length,
				usedTextLineFallback: words.length === 0 && textBlocks.length > 0,
			},
		};
	} finally {
		await worker.terminate();
	}
}

export { runTesseractOcr };

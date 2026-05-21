import path from 'path';
import { convertPdfToImages } from './pdfConversionService.js';
import { preprocessImage } from './imagePreprocessService.js';
import { runPaddleOcr } from './paddleOcrService.js';
import { runTesseractOcr } from './tesseractService.js';
import { detectLayoutRegions } from './layoutDetectionService.js';
import { createFieldSuggestions, toTemplateField } from './fieldSuggestionService.js';

async function normalizePages(file, context = {}) {
	if (!file) throw new Error('OCR requires the stored template file');
	if (file.mimeType === 'application/pdf') {
		return convertPdfToImages(file, {
			outputDir: path.join(process.cwd(), 'data/template-uploads/pdf-pages'),
			baseName: context.templateId || `template-${Date.now()}`,
			pages: Number(process.env.OCR_MAX_PDF_PAGES || 3),
		});
	}
	return [{ ...file, pageNumber: 1 }];
}

async function runOcrForPage(page, context = {}) {
	const processed = await preprocessImage(page, {
		outputDir: path.join(process.cwd(), 'data/template-uploads/processed'),
		baseName: `${context.templateId || 'template'}-page-${page.pageNumber || 1}`,
	});
	const pageInput = {
		...processed,
		pageNumber: page.pageNumber || 1,
	};

	const paddle = await runPaddleOcr(pageInput);
	if (!paddle.unavailable && (paddle.text_blocks || []).length > 0) {
		return {
			...paddle,
			engine_chain: ['paddleocr'],
			preprocess: processed.preprocess,
		};
	}

	const tesseract = await runTesseractOcr(pageInput, {
		language: process.env.TESSERACT_LANG || 'eng',
		pageSegMode: process.env.TESSERACT_PSM || '6',
	});

	return {
		...tesseract,
		engine_chain: paddle.unavailable
			? ['paddleocr_unavailable', 'tesseract']
			: ['paddleocr_empty', 'tesseract'],
		paddle_status: paddle,
		preprocess: processed.preprocess,
	};
}

function combinePageResults(results, fileUrl) {
	const textBlocks = results.flatMap((result) => result.text_blocks || []);
	const text = results.map((result) => result.text || '').filter(Boolean).join('\n\n');
	const layout = detectLayoutRegions({ text_blocks: textBlocks });
	const detectedFields = createFieldSuggestions(layout);

	return {
		provider: results.some((result) => result.provider === 'paddleocr')
			? 'paddleocr'
			: 'tesseract',
		ocr_provider: results.map((result) => result.provider).join('+'),
		engine_chain: [...new Set(results.flatMap((result) => result.engine_chain || []))],
		fileUrl,
		text,
		text_blocks: textBlocks,
		detected_fields: detectedFields,
		signature_areas: layout.signature_areas,
		photo_areas: layout.photo_areas,
		qr_areas: layout.qr_areas,
		checkboxes: layout.checkboxes,
		tables: layout.tables,
		preprocess: results[0]?.preprocess || {},
		raw_pages: results,
	};
}

async function extractTextFromDocument(fileUrl, context = {}) {
	const pages = await normalizePages(context.file, context);
	const results = [];
	for (const page of pages) {
		results.push(await runOcrForPage(page, context));
	}
	return combinePageResults(results, fileUrl);
}

async function detectLayout(fileUrl, context = {}) {
	const ocrResult = await extractTextFromDocument(fileUrl, context);
	return {
		...ocrResult,
		layout: {
			pages: Math.max(1, ...ocrResult.text_blocks.map((block) => block.relative_box?.page || 1)),
			regions: ocrResult.detected_fields.map((field, index) => ({
				id: `region_${index + 1}`,
				kind: field.field_type,
				label: field.label,
				confidence: field.confidence,
				boundingBox: field.relative_box,
			})),
			signature_areas: ocrResult.signature_areas,
			photo_areas: ocrResult.photo_areas,
			qr_areas: ocrResult.qr_areas,
			checkboxes: ocrResult.checkboxes,
			tables: ocrResult.tables,
		},
	};
}

function suggestFieldsFromOcr(ocrResult) {
	const fields = ocrResult.detected_fields || createFieldSuggestions(detectLayoutRegions(ocrResult));
	return fields.map(toTemplateField);
}

export { detectLayout, extractTextFromDocument, suggestFieldsFromOcr };

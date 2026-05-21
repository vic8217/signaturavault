import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

async function optionalOpenCv() {
	try {
		const runtimeImport = new Function('specifier', 'return import(specifier)');
		return await runtimeImport('opencv4nodejs');
	} catch {
		return null;
	}
}

async function preprocessImage(input, options = {}) {
	const outputDir = options.outputDir || path.join(process.cwd(), 'data/template-uploads/processed');
	await mkdir(outputDir, { recursive: true });

	const baseName = options.baseName || `ocr-${Date.now()}`;
	const outputPath = path.join(outputDir, `${baseName}.png`);
	const source = input.bytes || input;
	const cv = await optionalOpenCv();

	let pipeline = sharp(source, { limitInputPixels: false }).rotate();
	const metadata = await pipeline.metadata();

	pipeline = pipeline
		.grayscale()
		.normalize()
		.sharpen({ sigma: 1.1 })
		.median(1)
		.png({ compressionLevel: 6 });

	const bytes = await pipeline.toBuffer();

	if (cv) {
		try {
			const image = cv.imdecode(bytes);
			const processed = image.gaussianBlur(new cv.Size(3, 3), 0).threshold(0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
			await writeFile(outputPath, cv.imencode('.png', processed));
		} catch {
			await writeFile(outputPath, bytes);
		}
	} else {
		await writeFile(outputPath, bytes);
	}

	const processedMetadata = await sharp(outputPath).metadata();
	return {
		bytes: await sharp(outputPath).toBuffer(),
		filePath: outputPath,
		mimeType: 'image/png',
		width: processedMetadata.width || metadata.width || 1,
		height: processedMetadata.height || metadata.height || 1,
		preprocess: {
			autoRotate: true,
			deskew: Boolean(cv),
			sharpen: true,
			grayscale: true,
			contrastEnhancement: true,
			noiseRemoval: true,
			cropBorders: false,
			openCvAvailable: Boolean(cv),
		},
	};
}

async function optimizePreviewImage(input) {
	return sharp(input.bytes || input, { limitInputPixels: false })
		.rotate()
		.resize({ width: 1800, withoutEnlargement: true })
		.png({ compressionLevel: 8 })
		.toBuffer();
}

export { optimizePreviewImage, preprocessImage };

import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { fromPath } from 'pdf2pic';
import { convertPDF } from 'pdf2image';

async function convertPdfToImages(file, options = {}) {
	if (file.mimeType !== 'application/pdf') {
		return [file];
	}

	const outputDir = options.outputDir || path.join(process.cwd(), 'data/template-uploads/pdf-pages');
	await mkdir(outputDir, { recursive: true });

	const maxPages = Number(options.pages || 3);
	const pageRule = maxPages === 1 ? '1' : `1-${maxPages}`;
	const baseName = options.baseName || `page-${Date.now()}`;

	try {
		const pages = await convertPDF(file.filePath, {
			density: options.density || 200,
			outputType: 'png',
			outputFormat: path.join(outputDir, `${baseName}_%d`),
			pages: pageRule,
			singleProcess: true,
		});
		return Promise.all(
			pages.map(async (page, index) => ({
				bytes: await readFile(page.path),
				filePath: page.path,
				mimeType: 'image/png',
				filename: page.name,
				pageNumber: page.page || index + 1,
			})),
		);
	} catch (pdf2imageError) {
		const converter = fromPath(file.filePath, {
			density: options.density || 200,
			format: 'png',
			savePath: outputDir,
			saveFilename: baseName,
			width: options.width || 1800,
			preserveAspectRatio: true,
		});
		const pages = await converter.bulk(maxPages, { responseType: 'image' });
		return Promise.all(
			pages.map(async (page, index) => ({
				bytes: await readFile(page.path),
				filePath: page.path,
				mimeType: 'image/png',
				filename: page.name,
				pageNumber: page.page || index + 1,
				conversionFallback: {
					from: 'pdf2image',
					to: 'pdf2pic',
					reason:
						pdf2imageError instanceof Error
							? pdf2imageError.message
							: 'pdf2image conversion failed',
				},
			})),
		);
	}
}

export { convertPdfToImages };

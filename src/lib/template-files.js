import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const ALLOWED_MIME_TYPES = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['application/pdf', 'pdf'],
]);

function templateUploadPath(...segments) {
	return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'template-uploads', ...segments);
}

function extensionForUpload(file) {
	const typeExtension = ALLOWED_MIME_TYPES.get(file.type);
	if (typeExtension) return typeExtension;

	const extension = String(file.name || '').split('.').pop()?.toLowerCase();
	if (['jpg', 'jpeg', 'png', 'pdf'].includes(extension)) {
		return extension === 'jpeg' ? 'jpg' : extension;
	}

	return null;
}

async function storeTemplateUpload(file, templateId) {
	const extension = extensionForUpload(file);
	if (!extension) {
		throw new Error('Unsupported upload format. Use JPG, PNG, or PDF.');
	}

	const directory = templateUploadPath(templateId);
	await mkdir(directory, { recursive: true });

	const filename = `original-${crypto.randomUUID()}.${extension}`;
	const filePath = path.join(directory, filename);
	const bytes = Buffer.from(await file.arrayBuffer());
	await writeFile(filePath, bytes);

	return {
		filePath,
		filename,
		mimeType: file.type || (extension === 'pdf' ? 'application/pdf' : `image/${extension}`),
		fileUrl: `/api/issuer/templates/${templateId}/file`,
		previewUrl: `/api/issuer/templates/${templateId}/file?preview=1`,
	};
}

function resolveStoredFile(fileUrl) {
	const match = String(fileUrl || '').match(/\/api\/issuer\/templates\/([^/]+)\/file/);
	if (!match) return null;
	return templateUploadPath(match[1]);
}

async function readTemplateFile(template) {
	const directory = resolveStoredFile(template.originalFileUrl);
	if (!directory) throw new Error('Template file is missing');

	const originalFileName = template.schema?.originalFileName;
	const filePath = originalFileName
		? path.join(directory, originalFileName)
		: null;

	if (!filePath) throw new Error('Template file is missing');

	return {
		bytes: await readFile(filePath),
		mimeType: template.schema?.mimeType || 'application/octet-stream',
		filename: originalFileName,
		filePath,
	};
}

export { ALLOWED_MIME_TYPES, readTemplateFile, storeTemplateUpload };

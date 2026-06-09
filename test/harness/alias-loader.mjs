import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));
const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs'];

// Runtime dependencies that cannot resolve/run outside the Next.js server
// runtime are redirected to in-memory test stubs backed by shared singletons.
const STUB_REDIRECTS = new Map([
	['next/headers', new URL('./stubs/next-headers.mjs', import.meta.url).href],
	['next/server', new URL('./stubs/next-server.mjs', import.meta.url).href],
	['@/lib/prisma', new URL('./stubs/prisma.mjs', import.meta.url).href],
]);

function resolveOnDisk(basePath) {
	if (existsSync(basePath) && statSync(basePath).isFile()) {
		return basePath;
	}

	for (const ext of CANDIDATE_EXTENSIONS) {
		const withExt = `${basePath}${ext}`;
		if (existsSync(withExt)) return withExt;
	}

	if (existsSync(basePath) && statSync(basePath).isDirectory()) {
		for (const ext of CANDIDATE_EXTENSIONS) {
			const indexFile = path.join(basePath, `index${ext}`);
			if (existsSync(indexFile)) return indexFile;
		}
	}

	return null;
}

export async function resolve(specifier, context, nextResolve) {
	const redirect = STUB_REDIRECTS.get(specifier);
	if (redirect) {
		return { url: redirect, shortCircuit: true };
	}

	if (specifier.startsWith('@/')) {
		const relativePath = specifier.slice(2);
		const target = resolveOnDisk(path.join(SRC_DIR, relativePath));
		if (target) {
			return { url: pathToFileURL(target).href, shortCircuit: true };
		}
	}

	try {
		return await nextResolve(specifier, context);
	} catch (error) {
		// Next.js/bundler-style extensionless relative imports do not resolve
		// under raw Node ESM; replicate extension/index resolution so route code
		// can be exercised directly in tests.
		if (
			(specifier.startsWith('./') || specifier.startsWith('../')) &&
			context.parentURL
		) {
			const base = fileURLToPath(new URL(specifier, context.parentURL));
			const target = resolveOnDisk(base);
			if (target) {
				return { url: pathToFileURL(target).href, shortCircuit: true };
			}
		}
		throw error;
	}
}

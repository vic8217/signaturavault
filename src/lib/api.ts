import { NextResponse } from 'next/server';

function jsonError(message: string, status = 400) {
	return NextResponse.json({ error: message }, { status });
}

function safeApiErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof Error)) {
		return fallback;
	}

	const message = error.message;
	if (message.includes('ECONNREFUSED') || message.includes("Can't reach database server")) {
		return `${fallback}. PostgreSQL is not running or is not reachable at DATABASE_URL.`;
	}
	const databaseFragments = [
		'Prisma',
		'database',
		'postgres',
		'ECONNREFUSED',
		'ENOTFOUND',
		'Connection terminated',
		"Can't reach",
	];
	const unsafeFragments = [
		'__TURBOPACK__',
		'/home/',
		'.next/',
		'invocation',
		...databaseFragments,
	];

	if (databaseFragments.some((fragment) => message.includes(fragment))) {
		return `${fallback}. Check PostgreSQL connection and credentials.`;
	}

	if (unsafeFragments.some((fragment) => message.includes(fragment))) {
		return fallback;
	}

	return message;
}

export { jsonError, safeApiErrorMessage };

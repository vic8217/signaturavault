import { proxy as appProxy } from './src/proxy';

export function proxy(request) {
	return appProxy(request);
}

export const config = {
	matcher: [
		'/wallet/:path*',
		'/issuer-portal/:path*',
		'/admin/:path*',
		'/issuer/:path*',
	],
};

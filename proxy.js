import { proxy as appProxy } from './src/proxy';

export function proxy(request) {
	return appProxy(request);
}

export const config = {
	matcher: [
		'/signatura/:path*',
		'/wallet/:path*',
		'/issuer/:path*',
		'/issuer-portal/:path*',
		'/admin/:path*',
	],
};

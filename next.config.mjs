import { getNextConfigRedirects } from './config/portalRoutes.mjs';

const projectRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		proxyClientMaxBodySize:
			process.env.TEMPLATE_UPLOAD_PROXY_MAX_BODY_SIZE || '50mb',
	},
	allowedDevOrigins: [
		'192.168.1.33',
		'192.168.68.139',
		'juiciness-demeanor-december.ngrok-free.dev',
		'*.ngrok-free.dev',
		'*.ngrok-free.app',
	],
	turbopack: {
		root: projectRoot,
	},
	async redirects() {
		return getNextConfigRedirects();
	},
};

export default nextConfig;

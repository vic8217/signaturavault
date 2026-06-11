import { getNextConfigRedirects } from './config/portalRoutes.mjs';

const projectRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: [
		'192.168.1.33',
		'192.168.68.139',
		'juiciness-demeanor-december.ngrok-free.dev',
	],
	turbopack: {
		root: projectRoot,
	},
	async redirects() {
		return getNextConfigRedirects();
	},
};

export default nextConfig;

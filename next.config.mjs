const projectRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: ['192.168.1.33'],
	turbopack: {
		root: projectRoot,
	},
};

export default nextConfig;

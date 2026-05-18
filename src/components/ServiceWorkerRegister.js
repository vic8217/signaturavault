'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
	useEffect(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker
				.register('/sw.js', { scope: '/', updateViaCache: 'none' })
				.catch(() => {
					// Silently fail if SW not available
				});
		}
	}, []);

	return null;
}

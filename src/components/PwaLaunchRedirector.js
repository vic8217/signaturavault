'use client';

import { useEffect } from 'react';
import { accuraHandoffFromSearchParams } from '@/lib/accuraRegistrationEntry';

function paramsObject(searchParams) {
	return Object.fromEntries(searchParams.entries());
}

function accuraRegisterTargetFromUrl(value) {
	let url;
	try {
		url = new URL(String(value || ''), window.location.origin);
	} catch {
		return '';
	}

	if (url.origin !== window.location.origin) return '';

	const source = String(
		url.searchParams.get('source') || url.searchParams.get('sourceApp') || '',
	).toLowerCase();
	const app = String(url.searchParams.get('app') || '').toUpperCase();
	const hasAccuraMarker = source === 'accura' || app === 'ACCURA';
	const hasHandoff =
		url.searchParams.has('handoffToken') ||
		url.searchParams.has('token') ||
		url.searchParams.has('registrationHandoff');
	const hasChallenge =
		url.searchParams.has('challengeId') ||
		url.searchParams.has('handoffId') ||
		url.searchParams.get('flowType') === 'cross_device_qr';

	if (url.pathname === '/app-approval' && hasChallenge) {
		return `${url.pathname}${url.search}`;
	}

	if (url.pathname === '/register/accura' && (hasHandoff || hasChallenge)) {
		return `${url.pathname}${url.search}`;
	}

	if (hasAccuraMarker && hasHandoff) {
		const handoff = accuraHandoffFromSearchParams(paramsObject(url.searchParams));
		if (handoff.registerPath) return handoff.registerPath;
	}

	if (url.pathname === '/login') {
		const next = url.searchParams.get('next') || '';
		if (next) return accuraRegisterTargetFromUrl(next);
	}

	return '';
}

function redirectToAccuraApproval(targetUrl) {
	const targetPath = accuraRegisterTargetFromUrl(targetUrl);
	if (!targetPath) return false;

	const currentPath = `${window.location.pathname}${window.location.search}`;
	if (currentPath !== targetPath) {
		window.location.replace(targetPath);
	}
	return true;
}

export function PwaLaunchRedirector() {
	useEffect(() => {
		redirectToAccuraApproval(window.location.href);

		const launchQueue = window.launchQueue;
		if (!launchQueue?.setConsumer) return;

		launchQueue.setConsumer((launchParams) => {
			if (launchParams?.targetURL) {
				redirectToAccuraApproval(launchParams.targetURL);
			}
		});
	}, []);

	return null;
}

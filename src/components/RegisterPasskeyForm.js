'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
} from '@simplewebauthn/browser';
import {
	REGISTRATION_STATUSES,
	registrationStatusCardState,
	registrationStepForUi,
} from '@/lib/registration-status';
import { PasskeyNotice } from './PasskeyNotice';
import { RegistrationStatusCard } from './RegistrationStatusCard';
import {
	registrationApiFetch,
	registrationApiRequest,
	readRegistrationApiJson,
} from '@/lib/registration-api-client';
import {
	clearStoredTrustedDeviceSignaturaId,
	storeTrustedDeviceSignaturaId,
} from '@/lib/trustedDeviceLoginClient';
import {
	createDeviceBindingSecret,
	storeDeviceBindingSecret,
} from '@/lib/trustedDeviceBindingClient';
import { isPhoneUnreachableAccuraReturnUrl } from '@/lib/externalReturnUrl';

const REGISTRATION_STORAGE_KEY = 'signatura.pendingRegistration';

function isMobileRegistrationClient() {
	if (typeof window === 'undefined') return false;
	return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || '');
}

function shouldDeferAccuraReturnToDesktop(returnUrl = '', isAccuraRegistration = false) {
	return Boolean(
		returnUrl &&
		isAccuraRegistration &&
		isPhoneUnreachableAccuraReturnUrl(returnUrl) &&
		isMobileRegistrationClient(),
	);
}

function applyRegistrationSessionToForm({
	data,
	pendingRegistration,
	setters,
}) {
	const {
		setCreatedAccount,
		setRegistrationSessionId,
		setRegistrationToken,
		setForm,
		setStatus,
		setStep,
		setPasskeySummary,
		setTrustedDeviceSummary,
		setStatusCard,
		setRecoveryPhrase,
		setRecoveryPhraseAlreadyIssued,
	} = setters;

	if (data.currentStep === REGISTRATION_STATUSES.COMPLETED) {
		return 'completed';
	}

	setCreatedAccount(data.user || null);
	setRegistrationSessionId(data.registrationSessionId || pendingRegistration?.registrationSessionId || '');
	setRegistrationToken('');
	setForm((current) => ({
		...current,
		signaturaId:
			data.user?.signaturaId ||
			pendingRegistration?.signaturaId ||
			current.signaturaId,
		deviceName:
			data.trustedDeviceSummary?.deviceName ||
			data.passkeySummary?.deviceName ||
			current.deviceName,
	}));
	setPasskeySummary(data.passkeySummary || null);
	setTrustedDeviceSummary(data.trustedDeviceSummary || null);
	setStatusCard(
		data.statusCard ||
			registrationStatusCardState(data.currentStep || REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION),
	);
	setRecoveryPhraseAlreadyIssued(Boolean(data.recoveryPhraseAlreadyIssued));
	if (data.recoveryPhraseAlreadyIssued) {
		setRecoveryPhrase('');
	}
	setStatus('Pending registration resumed. Continue where you left off.');
	setStep(registrationStepForUi(data.currentStep));
	writePendingRegistration({
		registrationSessionId: data.registrationSessionId || pendingRegistration?.registrationSessionId || '',
		signaturaId: data.user?.signaturaId || pendingRegistration?.signaturaId || '',
		currentStep: data.currentStep,
	});
	return 'resumed';
}

function readPendingRegistration() {
	if (typeof window === 'undefined') return null;
	try {
		return JSON.parse(window.localStorage.getItem(REGISTRATION_STORAGE_KEY) || 'null');
	} catch {
		return null;
	}
}

function writePendingRegistration({
	registrationSessionId,
	signaturaId,
	currentStep,
}) {
	if (typeof window === 'undefined' || !registrationSessionId) return;
	window.localStorage.setItem(
		REGISTRATION_STORAGE_KEY,
		JSON.stringify({
			registrationSessionId,
			signaturaId,
			currentStep,
		}),
	);
}

function AdminSetupQrPanel({ userId, registrationSessionId, signaturaId }) {
	const router = useRouter();
	const [qrUrl, setQrUrl] = useState('');
	const [qrImage, setQrImage] = useState('');
	const [expiresAt, setExpiresAt] = useState('');
	const [countdown, setCountdown] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!expiresAt) return;
		const timer = window.setInterval(() => {
			const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
			const minutes = Math.floor(remaining / 60000);
			const seconds = Math.floor((remaining % 60000) / 1000);
			setCountdown(`${minutes}:${String(seconds).padStart(2, '0')}`);
		}, 1000);
		return () => window.clearInterval(timer);
	}, [expiresAt]);

	useEffect(() => {
		if (!qrUrl || !userId || !registrationSessionId) return;
		let cancelled = false;

		function tokenFromQrUrl() {
			try {
				return new URL(qrUrl).searchParams.get('token') || '';
			} catch {
				return '';
			}
		}

		async function pollSetupStatus() {
			const token = tokenFromQrUrl();
			if (!token) return;
			try {
				const response = await fetch('/api/admin/setup-token/status', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ token, userId, registrationSessionId }),
					cache: 'no-store',
				});
				const data = await response.json().catch(() => ({}));
				if (cancelled) return;

				if (!response.ok) {
					setError(data.error || 'Unable to check admin setup status.');
					return;
				}

				if (data.requiresRecovery) {
					setStatus(
						data.message ||
							'Admin passkey created on your phone. Complete recovery setup on the phone to activate admin access.',
					);
					return;
				}

				if (data.next) {
					setStatus('Admin setup complete. Opening admin dashboard...');
					router.replace(data.next || '/admin');
					return;
				}
				if (data.status === 'EXPIRED') {
					setError(data.message || 'This setup QR has expired.');
					setStatus('');
				}
			} catch (pollError) {
				setError(
					pollError instanceof Error
						? pollError.message
						: 'Unable to check admin setup status.',
				);
			}
		}

		const timer = window.setInterval(pollSetupStatus, 2500);
		pollSetupStatus();
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [qrUrl, registrationSessionId, router, userId]);

	async function generateSetupQr() {
		setIsLoading(true);
		setError('');
		setStatus('Generating one-time admin setup QR...');
		try {
			const response = await fetch('/api/admin/setup-token/create', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId, registrationSessionId }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Unable to create admin setup QR.');
			}
			const { default: QRCode } = await import('qrcode');
			const image = await QRCode.toDataURL(data.qrPayload || data.setupUrl, {
				errorCorrectionLevel: 'M',
				margin: 1,
				width: 260,
				color: {
					dark: '#020617',
					light: '#ffffff',
				},
			});
			setQrUrl(data.setupUrl || data.qrPayload || '');
			setQrImage(image);
			setExpiresAt(data.expiresAt || '');
			setStatus('Scan with your phone camera to set up your Signatura admin passkey.');
		} catch (setupQrError) {
			setError(
				setupQrError instanceof Error
					? setupQrError.message
					: 'Unable to create admin setup QR.',
			);
			setStatus('');
		} finally {
			setIsLoading(false);
		}
	}

	async function copySetupLink() {
		if (!qrUrl) return;
		await window.navigator.clipboard?.writeText(qrUrl);
		setStatus('Setup link copied. Open it on the phone that will hold the admin passkey.');
	}

	return (
		<div className="mt-6 rounded-lg border border-red-300/30 bg-red-500/10 p-5">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-200">
						Phone setup QR
					</p>
					<h2 className="mt-2 text-xl font-bold text-white">
						Set up admin passkey on your phone
					</h2>
					<p className="mt-2 text-sm leading-6 text-red-50/85">
						Scan with your phone camera to set up your Signatura admin passkey.
						The link opens Signatura directly; no second QR scan is required.
					</p>
				</div>
				{expiresAt ? (
					<div className="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-right">
						<p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
							Expires
						</p>
						<p className="font-mono text-lg font-bold text-white">
							{countdown || '10:00'}
						</p>
					</div>
				) : null}
			</div>

			<div className="mt-5 grid gap-4 sm:grid-cols-[auto,1fr]">
				<div className="flex h-[280px] w-full items-center justify-center rounded-lg border border-white/10 bg-white p-3 sm:w-[280px]">
					{qrImage ? (
						<img
							src={qrImage}
							alt={`One-time setup QR for ${signaturaId}`}
							className="h-full w-full object-contain"
						/>
					) : (
						<p className="px-4 text-center text-sm font-semibold text-slate-600">
							Generate a one-time QR after creating the admin Signatura ID.
						</p>
					)}
				</div>
				<div className="flex flex-col justify-between gap-4">
					<div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
						<dl className="grid gap-2 text-sm">
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Admin Signatura ID</dt>
								<dd className="font-mono text-white">{signaturaId}</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Token</dt>
								<dd className="font-semibold text-white">Single use</dd>
							</div>
						</dl>
					</div>
					<div className="grid gap-3">
						<button
							type="button"
							onClick={generateSetupQr}
							disabled={isLoading}
							className="rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
							{qrImage ? 'Regenerate QR' : 'Generate QR'}
						</button>
						<button
							type="button"
							onClick={copySetupLink}
							disabled={!qrUrl}
							className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
							Copy setup link
						</button>
					</div>
				</div>
			</div>

			{status ? <p className="mt-4 text-sm text-red-50">{status}</p> : null}
			{error ? (
				<div className="mt-4 rounded-lg border border-red-500/50 bg-slate-950/70 p-4 text-sm text-red-50">
					{error}
				</div>
			) : null}
		</div>
	);
}

function clearPendingRegistration() {
	if (typeof window === 'undefined') return;
	window.localStorage.removeItem(REGISTRATION_STORAGE_KEY);
}

function resolveRegistrationContext({
	registrationSessionId = '',
	createdAccount = null,
} = {}) {
	const pending = readPendingRegistration();
	return {
		activeSessionId: registrationSessionId || pending?.registrationSessionId || '',
		activeUserId: createdAccount?.id || '',
		activeSignaturaId: createdAccount?.signaturaId || pending?.signaturaId || '',
	};
}

function RegisterPasskeyForm({
	nextPath = '/signatura/dashboard',
	externalReturnUrl = '',
	appRegistrationContext = {},
	accuraHandoffToken = '',
	issuerInvitationToken = '',
	initialSignaturaId = '',
	initialAccountType = 'user',
	showIssuerRegistrationLink = false,
	setupMode = '',
}) {
	const router = useRouter();
	const isDeviceSetup = setupMode === 'device' && Boolean(initialSignaturaId);
	const [form, setForm] = useState({
		signaturaId: initialSignaturaId,
		fullName: '',
		handphone: '',
		email: '',
		authorizationCode: '',
		adminProvisioningSecret: '',
		deviceName: '',
	});
	const accountType = ['issuer', 'admin'].includes(initialAccountType)
		? initialAccountType
		: 'user';
	const registrationSource = String(appRegistrationContext.source || '').toLowerCase();
	const isAccuraRegistration = registrationSource === 'accura';
	const canShowIssuerRegistrationLink =
		Boolean(showIssuerRegistrationLink) && !isAccuraRegistration;
	const companyCode = appRegistrationContext.companyCode || '';
	const companyName = appRegistrationContext.companyName || '';
	const accuraRole = appRegistrationContext.role || '';
	const accuraRolePrefix = appRegistrationContext.rolePrefix || '';
	const accuraRegistrationKeyId = appRegistrationContext.registrationKeyId || '';
	const [step, setStep] = useState(isDeviceSetup ? 'resume' : 'account');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [recoveryPhrase, setRecoveryPhrase] = useState('');
	const [recoveryPhraseSaved, setRecoveryPhraseSaved] = useState(false);
	const [recoveryPhraseAlreadyIssued, setRecoveryPhraseAlreadyIssued] = useState(false);
	const [passkeySummary, setPasskeySummary] = useState(null);
	const [trustedDeviceSummary, setTrustedDeviceSummary] = useState(null);
	const [statusCard, setStatusCard] = useState(null);
	const [createdAccount, setCreatedAccount] = useState(null);
	const [existingAccount, setExistingAccount] = useState(null);
	const [continuingExistingAccount, setContinuingExistingAccount] = useState(false);
	const [registrationToken, setRegistrationToken] = useState('');
	const [registrationSessionId, setRegistrationSessionId] = useState('');
	const [serverReturnUrl, setServerReturnUrl] = useState('');
	const trustedDevicesHref = `/signatura/trusted-devices?next=${encodeURIComponent(nextPath)}`;
	const issuerRegisterHref = `/register?next=${encodeURIComponent('/issuer')}&accountType=issuer`;
	const createAccountHref = `/register?next=${encodeURIComponent(nextPath)}${
		externalReturnUrl ? `&returnUrl=${encodeURIComponent(externalReturnUrl)}` : ''
	}`;
	const loginHref = `/login?next=${encodeURIComponent(nextPath)}${
		externalReturnUrl ? `&returnUrl=${encodeURIComponent(externalReturnUrl)}` : ''
	}`;
	const existingAccountLoginHref = existingAccount?.signaturaId
		? `/login?signaturaId=${encodeURIComponent(existingAccount.signaturaId)}&next=${encodeURIComponent(nextPath)}${
				externalReturnUrl ? `&returnUrl=${encodeURIComponent(externalReturnUrl)}` : ''
			}`
		: loginHref;
	const existingAccountDeviceHref = existingAccount?.signaturaId
		? `/register?setup=device&signaturaId=${encodeURIComponent(existingAccount.signaturaId)}&next=${encodeURIComponent(nextPath)}${
				externalReturnUrl ? `&returnUrl=${encodeURIComponent(externalReturnUrl)}` : ''
			}`
		: '';
	const accountTypeLabel =
		accountType === 'admin'
			? 'Admin account'
			: accountType === 'issuer'
				? 'Issuer account'
			: 'Document owner account';
	const pageTitle = isAccuraRegistration
		? 'Link your SIGNATURA ID to ACCURA'
		: 'Create your SIGNATURA account';
	const finalReturnHref = (() => {
		if (serverReturnUrl) return serverReturnUrl;
		if (isAccuraRegistration) return '';
		if (!externalReturnUrl || !createdAccount?.signaturaId) return '';
		try {
			const destination = new URL(externalReturnUrl);
			destination.searchParams.set('signaturaId', createdAccount.signaturaId);
			destination.searchParams.set('signaturaUserId', createdAccount.id);
			if (isAccuraRegistration) {
				destination.searchParams.set('source', 'accura');
				destination.searchParams.set('companyCode', companyCode);
				destination.searchParams.set('role', accuraRole);
				destination.searchParams.set('rolePrefix', accuraRolePrefix);
				destination.searchParams.set('registrationStatus', 'success');
			} else {
				destination.searchParams.set('signaturaRegistration', 'complete');
			}
			return destination.toString();
		} catch {
			return '';
		}
	})();
	const existingReturnHref = (() => {
		if (!externalReturnUrl || !existingAccount?.signaturaId) return '';
		try {
			const destination = new URL(externalReturnUrl);
			destination.searchParams.set('signaturaId', existingAccount.signaturaId);
			destination.searchParams.set('source', 'accura');
			destination.searchParams.set('companyCode', companyCode);
			destination.searchParams.set('role', accuraRole);
			destination.searchParams.set('rolePrefix', accuraRolePrefix);
			destination.searchParams.set(
				'registrationStatus',
				existingAccount.linkedToCompany ? 'success' : 'account_exists',
			);
			return destination.toString();
		} catch {
			return '';
		}
	})();

	function buildExistingAccountReturnHref() {
		if (existingReturnHref) return existingReturnHref;
		if (!externalReturnUrl || !existingAccount?.signaturaId) return '';
		try {
			const destination = new URL(externalReturnUrl);
			destination.searchParams.set('signaturaId', existingAccount.signaturaId);
			destination.searchParams.set('source', 'accura');
			destination.searchParams.set('companyCode', companyCode);
			destination.searchParams.set('role', accuraRole);
			destination.searchParams.set('rolePrefix', accuraRolePrefix);
			destination.searchParams.set(
				'registrationStatus',
				existingAccount.linkedToCompany ? 'success' : 'account_exists',
			);
			return destination.toString();
		} catch {
			return '';
		}
	}

	async function continueExistingAccountInAccura() {
		if (!existingAccount?.signaturaId) {
			setError('Existing Signatura ID is missing. Refresh and try again.');
			return;
		}
		const destination = buildExistingAccountReturnHref();
		if (!destination) {
			setError('Unable to build ACCURA return URL. Return to ACCURA and paste your Signatura ID manually.');
			return;
		}

		setContinuingExistingAccount(true);
		setError('');
		setStatus('Returning to ACCURA...');

		const usesAccuraCallback = /\/api\/[^/]+\/[^/]+/.test(destination);
		if (usesAccuraCallback && externalReturnUrl) {
			try {
				const response = await registrationApiFetch(
					'/api/auth/register/accura/complete-existing',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							returnUrl: externalReturnUrl,
							signaturaId: existingAccount.signaturaId,
							companyCode,
							role: accuraRole,
							rolePrefix: accuraRolePrefix,
						}),
					},
				);
				const data = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(data.error || 'ACCURA could not continue registration.');
				}
				if (
					shouldDeferAccuraReturnToDesktop(destination, isAccuraRegistration) ||
					shouldDeferAccuraReturnToDesktop(externalReturnUrl, isAccuraRegistration)
				) {
					setStatus(
						'ACCURA received your Signatura ID. Return to ACCURA on your computer to finish registration.',
					);
					setContinuingExistingAccount(false);
					return;
				}
			} catch (continueError) {
				setStatus('');
				setError(
					continueError instanceof Error
						? continueError.message
						: 'Unable to notify ACCURA.',
				);
				setContinuingExistingAccount(false);
				return;
			}
		}

		window.location.href = destination;
	}

	async function linkExistingIdentityToAccura() {
		const signaturaId = existingAccount?.signaturaId;
		if (!signaturaId || !accuraHandoffToken || continuingExistingAccount) {
			return;
		}
		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support biometric/passkey approval.');
			return;
		}

		setContinuingExistingAccount(true);
		setError('');
		setStatus('Preparing biometric approval for your existing Signatura identity...');
		try {
			const { response: startResponse, data: startData } =
				await registrationApiRequest(
					'/api/auth/login/start',
					{
						method: 'POST',
						body: JSON.stringify({ signaturaId }),
					},
					'Existing identity link start',
				);
			if (!startResponse.ok) {
				throw new Error(
					startData?.error || 'Unable to start biometric approval.',
				);
			}

			setStatus('Approve the new ACCURA role with your biometric or device PIN.');
			const assertion = await startAuthentication({
				optionsJSON: startData.options,
			});
			const { response: linkResponse, data: linkData } =
				await registrationApiRequest(
					'/api/auth/register/accura/link',
					{
						method: 'POST',
						body: JSON.stringify({
							accuraHandoffToken,
							signaturaId,
							response: assertion,
						}),
					},
					'ACCURA role link',
				);
			if (!linkResponse.ok) {
				throw new Error(
					linkData?.error || 'Unable to link this ACCURA role.',
				);
			}

			storeTrustedDeviceSignaturaId(signaturaId);
			const destination =
				linkData.accuraReturnUrl || linkData.redirectTo || externalReturnUrl;
			if (
				shouldDeferAccuraReturnToDesktop(destination, isAccuraRegistration)
			) {
				setExistingAccount((current) => ({
					...current,
					linkedToCompany: true,
					linkRequired: false,
				}));
				setStatus(
					'ACCURA role linked. Return to ACCURA on your computer to continue.',
				);
				return;
			}
			setStatus('ACCURA role linked. Returning to ACCURA...');
			window.location.href = destination || '/signatura/dashboard';
		} catch (linkError) {
			setStatus('');
			setError(
				linkError instanceof Error
					? linkError.message
					: 'Unable to link this ACCURA role.',
			);
		} finally {
			setContinuingExistingAccount(false);
		}
	}

	const accuraScopedIdMessage =
		'Use this existing Signatura ID and approve biometric linking to add the ACCURA company role.';

	function accuraFailureReturnHref(errorCode = 'registration_failed') {
		if (!externalReturnUrl || !isAccuraRegistration) return '';
		try {
			const destination = new URL(externalReturnUrl);
			destination.searchParams.set('registrationStatus', 'failed');
			destination.searchParams.set('errorCode', errorCode);
			return destination.toString();
		} catch {
			return '';
		}
	}

	function returnToLogin() {
		router.push(loginHref);
	}

	function startNewAccountRegistration() {
		clearStoredTrustedDeviceSignaturaId();
		router.push(createAccountHref);
	}

	useEffect(() => {
		if (isDeviceSetup) return undefined;

		const pendingRegistration = readPendingRegistration();
		const pendingSessionId = String(
			pendingRegistration?.registrationSessionId || '',
		).trim();
		if (!pendingSessionId) return undefined;

		let isMounted = true;
		fetch(`/api/auth/register/session/${encodeURIComponent(pendingSessionId)}`, {
			headers: {
				Accept: 'application/json',
				'ngrok-skip-browser-warning': '1',
			},
		})
			.then(async (response) => {
				const data = await readRegistrationApiJson(response, 'Registration session').catch(
					() => ({}),
				);
				if (!isMounted) return;

				if (!response.ok || !data.active) {
					clearPendingRegistration();
					return;
				}

				const resumeResult = applyRegistrationSessionToForm({
					data,
					pendingRegistration,
					setters: {
						setCreatedAccount,
						setRegistrationSessionId,
						setRegistrationToken,
						setForm,
						setStatus,
						setStep,
						setPasskeySummary,
						setTrustedDeviceSummary,
						setStatusCard,
						setRecoveryPhrase,
						setRecoveryPhraseAlreadyIssued,
					},
				});
				if (resumeResult === 'completed') {
					clearPendingRegistration();
					router.push('/login');
				}
			})
			.catch(() => {
				if (isMounted) clearPendingRegistration();
			});

		return () => {
			isMounted = false;
		};
	}, [isDeviceSetup, router]);

	async function cancelPendingRegistration() {
		const pendingSessionId = registrationSessionId || readPendingRegistration()?.registrationSessionId;
		clearPendingRegistration();

		if (pendingSessionId) {
			await registrationApiFetch('/api/auth/register/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ registrationSessionId: pendingSessionId }),
			}).catch(() => null);
		}

		returnToLogin();
	}

	function completeRegistration() {
		if (finalReturnHref) {
			window.location.href = finalReturnHref;
			return;
		}
		router.push('/login');
	}

	async function activateAccount() {
		setError('');
		setStatus('Activating your account...');
		const { activeSessionId, activeUserId } = resolveRegistrationContext({
			registrationSessionId,
			createdAccount,
		});

		if (!activeSessionId && !activeUserId) {
			setError(
				'Registration session expired. Refresh the page and resume setup with your Signatura ID.',
			);
			setStatus('');
			return;
		}

		try {
			const { response, data } = await registrationApiRequest(
				'/api/auth/register/activate',
				{
					method: 'POST',
					body: JSON.stringify({
						userId: activeUserId,
						registrationSessionId: activeSessionId,
					}),
				},
				'Account activation',
			);
			if (!response.ok) throw new Error(data.error);

			clearPendingRegistration();
			setRegistrationSessionId('');
			setCreatedAccount(data.user || createdAccount);
			setStatusCard(registrationStatusCardState(REGISTRATION_STATUSES.COMPLETED));
			if (data.accuraReturnUrl || data.redirectTo) {
				const destination = data.accuraReturnUrl || data.redirectTo;
				if (shouldDeferAccuraReturnToDesktop(destination, isAccuraRegistration)) {
					setServerReturnUrl(destination);
					setStep('complete');
					setStatus(
						'Your Signatura ID is ready. Return to ACCURA on your computer — registration will continue automatically.',
					);
					return;
				}
				setStatus('Your account is active. Returning to ACCURA...');
				setServerReturnUrl(destination);
				window.location.href = destination;
				return;
			}
			setStatus('Your account is active. Redirecting to login...');
			completeRegistration();
		} catch (activationError) {
			setError(
				activationError instanceof Error
					? activationError.message
					: 'Account activation failed.',
			);
			setStatus('');
		}
	}

	function updateField(event) {
		setForm((current) => ({
			...current,
			[event.target.name]: event.target.value,
		}));
	}

	async function createAccount(event) {
		event.preventDefault();
		setError('');
		setExistingAccount(null);
		setStatus('Creating your SIGNATURA ID...');

		try {
			const response = await registrationApiFetch('/api/auth/register/account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						fullName: form.fullName,
						handphone: form.handphone,
						email: form.email,
						authorizationCode: form.authorizationCode,
						adminProvisioningSecret: form.adminProvisioningSecret,
						issuerInvitationToken,
						accountType,
						source: registrationSource,
						accuraHandoffToken,
						companyCode: isAccuraRegistration ? '' : companyCode,
					companyName: isAccuraRegistration ? '' : companyName,
					role: isAccuraRegistration ? '' : accuraRole,
					rolePrefix: isAccuraRegistration ? '' : accuraRolePrefix,
					registrationKeyId: isAccuraRegistration ? '' : accuraRegistrationKeyId,
					returnUrl: isAccuraRegistration ? '' : externalReturnUrl,
				}),
			});
			const data = await response.json();
			if (!response.ok) {
					if (data?.existingSignaturaId) {
						setExistingAccount({
							signaturaId: data.existingSignaturaId,
							linkedToCompany: Boolean(data.linkedToCompany),
							linkRequired: Boolean(data.linkRequired),
							setupIncomplete: Boolean(data.setupIncomplete),
						});
				} else {
					const failureHref = accuraFailureReturnHref(
						data?.errorCode || data?.error || 'registration_failed',
					);
					if (failureHref) {
						window.location.href = failureHref;
						return;
					}
				}
				throw new Error(data.error);
			}
				setCreatedAccount(data.user);
				setRegistrationToken(data.registrationToken || '');
				setRegistrationSessionId(data.registrationSessionId || '');
				setForm((current) => ({
					...current,
					signaturaId: data.user?.signaturaId || current.signaturaId,
				}));
				writePendingRegistration({
					registrationSessionId: data.registrationSessionId || '',
					signaturaId: data.user?.signaturaId || '',
					currentStep: REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION,
				});
				setPasskeySummary(null);
				setTrustedDeviceSummary(null);
				setStatusCard(
					registrationStatusCardState(REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION),
				);
				setRecoveryPhrase('');
			setRecoveryPhraseSaved(false);
			setRecoveryPhraseAlreadyIssued(false);
			setStatus(
				'Your SIGNATURA ID has been created. Create your passkey to continue setup.',
			);
			setStep('passkey');
		} catch (accountError) {
			setError(
				accountError instanceof Error
					? accountError.message
					: 'Account creation failed.',
			);
			setStatus('');
		}
	}

	async function createPasskey(event) {
		event.preventDefault();
		setError('');
		setStatus('Preparing passkey creation...');
		setRecoveryPhrase('');
		setRecoveryPhraseSaved(false);
		setRecoveryPhraseAlreadyIssued(false);

		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys/WebAuthn.');
			setStatus('');
			return;
		}
		const isLocalhost =
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1';
		if (!window.isSecureContext && !isLocalhost) {
			setError(
				'Passkeys require HTTPS on phones. Open Signatura using the HTTPS ngrok URL, then try again.',
			);
			setStatus('');
			return;
		}

		try {
			const pending = readPendingRegistration();
			const activeSessionId =
				registrationSessionId || pending?.registrationSessionId || '';
			const activeUserId = createdAccount?.id;

			if (!activeUserId) {
				throw new Error(
					'Registration account is missing. Refresh the page or resume setup with your Signatura ID.',
				);
			}
			if (!activeSessionId && !registrationToken) {
				throw new Error(
					'Registration session expired. Refresh the page or resume setup with your Signatura ID.',
				);
			}

			const { response: startResponse, data: startData } =
				await registrationApiRequest(
					'/api/auth/register/start',
					{
						method: 'POST',
						body: JSON.stringify({
							userId: activeUserId,
							registrationToken,
							registrationSessionId: activeSessionId,
							deviceName: form.deviceName || 'This device',
						}),
					},
					'Passkey setup',
				);
			if (!startResponse.ok) throw new Error(startData.error);

			if (startData.registrationSessionId) {
				setRegistrationSessionId(startData.registrationSessionId);
			}

			if (!startData.options) {
				throw new Error(
					'Passkey setup did not return WebAuthn options. Refresh and try again.',
				);
			}

			setStatus('Approve the passkey prompt on this device.');
			const registration = await startRegistration({
				optionsJSON: startData.options,
			});

			setStatus('Verifying cryptographic proof...');
			const { response: finishResponse, data: finishData } =
				await registrationApiRequest(
					'/api/auth/register/finish',
					{
						method: 'POST',
						body: JSON.stringify({
							userId: startData.userId || activeUserId,
							deviceName: form.deviceName || 'This device',
							response: registration,
						}),
					},
					'Passkey verification',
				);
			if (!finishResponse.ok) throw new Error(finishData.error);

			const nextSessionId =
				startData.registrationSessionId || activeSessionId || registrationSessionId;

			setCreatedAccount(finishData.user || createdAccount);
			setRegistrationSessionId(nextSessionId);
			setPasskeySummary(finishData.passkeySummary || null);
			setStatusCard(
				registrationStatusCardState(REGISTRATION_STATUSES.PASSKEY_CREATED),
			);
			writePendingRegistration({
				registrationSessionId: nextSessionId,
				signaturaId: finishData.user?.signaturaId || createdAccount?.signaturaId || '',
				currentStep: REGISTRATION_STATUSES.PASSKEY_CREATED,
			});
			setStatus('Passkey created successfully.');
			setStep('passkey_success');
		} catch (registrationError) {
			const message =
				registrationError instanceof Error
					? registrationError.message
					: 'Passkey creation failed.';
			setError(
				message.includes('Unexpected token')
					? 'Passkey setup received an invalid server response. Use the same HTTPS Signatura URL on your phone, refresh the page, then try again.'
					: message,
			);
			setStatus('');
		}
	}

	async function syncRegistrationSession(pendingSessionId = registrationSessionId) {
		const sessionId = String(pendingSessionId || '').trim();
		if (!sessionId) return null;

		const response = await registrationApiFetch(
			`/api/auth/register/session/${encodeURIComponent(sessionId)}`,
		);
		const data = await readRegistrationApiJson(response, 'Registration session').catch(
			() => ({}),
		);
		if (!response.ok || !data.active) return null;

		applyRegistrationSessionToForm({
			data,
			pendingRegistration: readPendingRegistration(),
			setters: {
				setCreatedAccount,
				setRegistrationSessionId,
				setRegistrationToken,
				setForm,
				setStatus,
				setStep,
				setPasskeySummary,
				setTrustedDeviceSummary,
				setStatusCard,
				setRecoveryPhrase,
				setRecoveryPhraseAlreadyIssued,
			},
		});
		return data;
	}

	async function continueToTrustedDevice() {
		setError('');
		setStatus('Continuing to trusted device registration...');
		const pending = readPendingRegistration();
		const activeSessionId =
			registrationSessionId || pending?.registrationSessionId || '';

		function applyContinueSuccess(data, fallbackStep) {
			const currentStep = data.currentStep || fallbackStep;
			const nextSessionId = data.registrationSessionId || activeSessionId;

			setRegistrationSessionId(nextSessionId);
			setCreatedAccount(data.user || createdAccount);
			setStatusCard(registrationStatusCardState(currentStep));
			writePendingRegistration({
				registrationSessionId: nextSessionId,
				signaturaId: data.user?.signaturaId || createdAccount?.signaturaId || '',
				currentStep,
			});
			setStatus(
				currentStep === REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED
					? 'Trusted device is already registered. Continue setup.'
					: currentStep === REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE
						? 'Trusted device registered. Continue to recovery setup.'
						: 'Register this device as your trusted Signatura device.',
			);
			setStep(registrationStepForUi(currentStep));
		}

		try {
			const response = await registrationApiFetch('/api/auth/register/continue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					registrationSessionId: activeSessionId,
					userId: createdAccount?.id,
					targetStep: 'trusted_device',
				}),
			});
			const data = await response.json();

			if (response.ok) {
				applyContinueSuccess(
					data,
					REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
				);
				return;
			}

			const synced = await syncRegistrationSession(activeSessionId);
			const resolvedStep = synced?.currentStep || data.currentStep || '';
			const canOpenTrustedDeviceStep = [
				REGISTRATION_STATUSES.PASSKEY_CREATED,
				REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
				REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
				REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			].includes(resolvedStep);

			if (canOpenTrustedDeviceStep) {
				applyContinueSuccess(
					{
						user: synced?.user || createdAccount,
						currentStep:
							resolvedStep === REGISTRATION_STATUSES.PASSKEY_CREATED
								? REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION
								: resolvedStep,
						registrationSessionId: synced?.registrationSessionId || activeSessionId,
					},
					REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
				);
				return;
			}

			const hint =
				typeof data?.hint === 'string' && data.hint.trim()
					? ` ${data.hint.trim()}`
					: '';
			throw new Error(`${data.error || 'Unable to continue registration.'}${hint}`);
		} catch (continueError) {
			setError(
				continueError instanceof Error
					? continueError.message
					: 'Unable to continue registration.',
			);
			setStatus('');
		}
	}

	async function registerTrustedDevice(event) {
		event.preventDefault();
		setError('');
		setStatus('Registering trusted device...');
		const { activeSessionId, activeUserId } = resolveRegistrationContext({
			registrationSessionId,
			createdAccount,
		});

		try {
			const deviceBindingSecret = createDeviceBindingSecret();
			const { response, data } = await registrationApiRequest(
				'/api/auth/register/trusted-device',
				{
					method: 'POST',
					body: JSON.stringify({
						userId: activeUserId,
						registrationSessionId: activeSessionId,
						deviceName:
							form.deviceName || passkeySummary?.deviceName || 'Trusted device',
						deviceBindingSecret,
					}),
				},
				'Trusted device registration',
			);
			if (!response.ok) throw new Error(data.error);

			const nextSessionId = data.registrationSessionId || activeSessionId;
			setRegistrationSessionId(nextSessionId);
			setCreatedAccount(data.user || createdAccount);
			setTrustedDeviceSummary(data.trustedDeviceSummary || null);
			setStatusCard(
				registrationStatusCardState(REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED),
			);
			writePendingRegistration({
				registrationSessionId: nextSessionId,
				signaturaId: data.user?.signaturaId || createdAccount?.signaturaId || '',
				currentStep: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
			});
			storeTrustedDeviceSignaturaId(
				data.user?.signaturaId || createdAccount?.signaturaId || '',
			);
			storeDeviceBindingSecret(
				data.user?.signaturaId || createdAccount?.signaturaId || '',
				deviceBindingSecret,
			);
			setStatus('Trusted device registered successfully.');
			setStep('trusted_device_success');
		} catch (deviceError) {
			setError(
				deviceError instanceof Error
					? deviceError.message
					: 'Trusted device registration failed.',
			);
			setStatus('');
		}
	}

	async function continueToRecovery() {
		setError('');
		setStatus('Preparing your recovery phrase...');
		setRecoveryPhrase('');
		setRecoveryPhraseSaved(false);
		const { activeSessionId, activeUserId } = resolveRegistrationContext({
			registrationSessionId,
			createdAccount,
		});

		if (!activeSessionId && !activeUserId) {
			setError(
				'Registration session expired. Refresh the page and resume setup with your Signatura ID.',
			);
			setStatus('');
			return;
		}

		try {
			const { response: continueResponse, data: continueData } =
				await registrationApiRequest(
					'/api/auth/register/continue',
					{
						method: 'POST',
						body: JSON.stringify({
							registrationSessionId: activeSessionId,
							userId: activeUserId,
							targetStep: 'recovery',
						}),
					},
					'Registration continue',
				);
			if (!continueResponse.ok) {
				const hint =
					typeof continueData?.hint === 'string' && continueData.hint.trim()
						? ` ${continueData.hint.trim()}`
						: '';
				throw new Error(`${continueData.error || 'Unable to continue registration.'}${hint}`);
			}

			const nextSessionId = continueData.registrationSessionId || activeSessionId;
			setRegistrationSessionId(nextSessionId);

			const { response: recoveryResponse, data: recoveryData } =
				await registrationApiRequest(
					'/api/auth/register/recovery',
					{
						method: 'POST',
						body: JSON.stringify({
							userId: activeUserId || continueData.user?.id,
							registrationSessionId: nextSessionId,
						}),
					},
					'Recovery phrase setup',
				);
			if (!recoveryResponse.ok) throw new Error(recoveryData.error);

			setCreatedAccount(recoveryData.user || continueData.user || createdAccount);
			setRecoveryPhraseAlreadyIssued(Boolean(recoveryData.recoveryPhraseAlreadyIssued));
			if (!recoveryData.recoveryPhraseAlreadyIssued) {
				setRecoveryPhrase(recoveryData.recoveryPhrase || '');
			}
			setStatusCard(
				registrationStatusCardState(REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE),
			);
			writePendingRegistration({
				registrationSessionId: nextSessionId,
				signaturaId:
					recoveryData.user?.signaturaId || createdAccount?.signaturaId || '',
				currentStep: REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			});
			setStatus(
				recoveryData.recoveryPhraseAlreadyIssued
					? 'Your recovery phrase was already generated. Confirm you saved it to activate your account.'
					: 'Save your recovery phrase offline before activating your account.',
			);
			setStep('recovery');
		} catch (recoveryError) {
			setError(
				recoveryError instanceof Error
					? recoveryError.message
					: 'Unable to continue to recovery phrase.',
			);
			setStatus('');
		}
	}

	async function resumeRegistrationForContact({
		signaturaId,
		handphone,
		email,
	}) {
		setError('');
		setStatus('Verifying your SIGNATURA ID...');
		setRecoveryPhrase('');
		setRecoveryPhraseSaved(false);
		setCreatedAccount(null);
		setRegistrationToken('');
		setRegistrationSessionId('');

		const response = await registrationApiFetch('/api/auth/register/resume', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				signaturaId,
				handphone,
				email,
			}),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		setCreatedAccount(data.user);
		setRegistrationToken(data.registrationToken || '');
		setRegistrationSessionId(data.registrationSessionId || '');

		const sessionResponse = await registrationApiFetch(
			`/api/auth/register/session/${encodeURIComponent(data.registrationSessionId || '')}`,
		);
		const sessionData = await readRegistrationApiJson(
			sessionResponse,
			'Registration session',
		).catch(() => ({}));
		if (sessionResponse.ok && sessionData.active) {
			applyRegistrationSessionToForm({
				data: sessionData,
				pendingRegistration: {
					registrationSessionId: data.registrationSessionId,
					signaturaId: data.user?.signaturaId,
				},
				setters: {
					setCreatedAccount,
					setRegistrationSessionId,
					setRegistrationToken,
					setForm,
					setStatus,
					setStep,
					setPasskeySummary,
					setTrustedDeviceSummary,
					setStatusCard,
					setRecoveryPhrase,
					setRecoveryPhraseAlreadyIssued,
				},
			});
			return;
		}

		writePendingRegistration({
			registrationSessionId: data.registrationSessionId || '',
			signaturaId: data.user?.signaturaId || signaturaId,
			currentStep: REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION,
		});
		setPasskeySummary(null);
		setTrustedDeviceSummary(null);
		setStatusCard(
			registrationStatusCardState(REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION),
		);
		setStatus('Your SIGNATURA ID is ready for passkey creation.');
		setStep('passkey');
	}

	async function continueExistingAccountSetup() {
		if (!existingAccount?.signaturaId) return;
		setContinuingExistingAccount(true);
		try {
			await resumeRegistrationForContact({
				signaturaId: existingAccount.signaturaId,
				handphone: form.handphone,
				email: form.email,
			});
		} catch (resumeError) {
			setError(
				resumeError instanceof Error
					? resumeError.message
					: 'Unable to resume account setup.',
			);
			setStatus('');
		} finally {
			setContinuingExistingAccount(false);
		}
	}

	async function resumeSetup(event) {
		event.preventDefault();
		try {
			await resumeRegistrationForContact({
				signaturaId: form.signaturaId,
				handphone: form.handphone,
				email: form.email,
			});
		} catch (resumeError) {
			setError(
				resumeError instanceof Error
					? resumeError.message
					: 'Unable to resume account setup.',
			);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					{isDeviceSetup ? 'Trusted device setup' : accountTypeLabel}
				</p>
				<h1 className="mt-2 text-3xl font-black">
					{isDeviceSetup
						? 'Register trusted device'
						: pageTitle}
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-300">
					{isDeviceSetup
						? 'Verify your SIGNATURA ID with the same email and handphone number used during account creation, then register this device.'
						: accountType === 'issuer'
							? 'Enter your details to create or resume your Universal Signatura ID. Issuer access is attached as a membership role.'
							: accountType === 'admin'
								? 'Enter authorized administrator details to create or resume your Universal Signatura ID. Admin access is attached as a platform role.'
								: 'Enter your details to generate your SIGNATURA ID. Your private contact information is encrypted before it is saved.'}
				</p>
				{!isDeviceSetup ? (
					<div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-50/90">
						Your name, handphone number, and email are protected as encrypted
						private fields. System admins and database managers cannot read them
						directly from the database. Signatura uses Zero Trust Level 2
						controls for this flow.
					</div>
				) : null}
				{isAccuraRegistration ? (
					<div className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-4 text-sm leading-6 text-red-50/90">
						<p className="font-bold">Registering for ACCURA company access</p>
						<p className="mt-2">
							<span className="font-semibold text-white">
								ACCURA Company Name:
							</span>{' '}
							{companyName || 'ACCURA company'}
						</p>
						<p>
							<span className="font-semibold text-white">
								ACCURA Company Code:
							</span>{' '}
							<span className="font-mono">{companyCode || 'Not applicable'}</span>
						</p>
						<p>
							<span className="font-semibold text-white">
								Assigned Role:
							</span>{' '}
							{accuraRole || 'Not provided'}
						</p>
						<p>
							<span className="font-semibold text-white">
								Role Prefix:
							</span>{' '}
							<span className="font-mono">
								{accuraRolePrefix || 'Not provided'}
							</span>
							</p>
							<p className="mt-2">
								Your Signatura ID identifies you. This ACCURA company and role
								will be stored as a separate authorization under the same identity.
							</p>
					</div>
				) : null}
			</div>

			{step === 'account' ? (
				<form onSubmit={createAccount} className="mt-6 grid gap-4">
					{accountType !== 'user' ? (
						<div className="rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-50/90">
							<p className="font-bold">
								{accountType === 'admin'
									? 'Admin Signatura ID'
									: 'Issuer Signatura ID'}
							</p>
							<p className="mt-1">
								{accountType === 'admin'
									? 'Admin IDs are provisioned from the admin URL only. Production blocks public admin self-registration.'
									: 'Issuer access uses your Universal Signatura ID and requires an active issuer tenant or invitation.'}
							</p>
						</div>
					) : null}
					<label className="grid gap-2 text-sm font-semibold">
						<span>Full name</span>
						<input
							name="fullName"
							placeholder="Example: Victor Santos"
							value={form.fullName}
							onChange={updateField}
							autoComplete="name"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Handphone number</span>
						<input
							name="handphone"
							placeholder="Example: +63 917 000 0000"
							value={form.handphone}
							onChange={updateField}
							autoComplete="tel"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Email address</span>
						<input
							name="email"
							type="email"
							placeholder="Example: victor@example.com"
							value={form.email}
							onChange={updateField}
							autoComplete="email"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					{accountType === 'issuer' ? (
						<label className="grid gap-2 text-sm font-semibold">
							<span>Issuer authorization code</span>
							<input
								name="authorizationCode"
								type="password"
								placeholder="Enter the issuer creation code"
								value={form.authorizationCode}
								onChange={updateField}
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
							<p className="text-xs font-normal text-slate-300">
								This code authorizes issuer Signatura ID creation and issuer portal access.
							</p>
						</label>
					) : null}
					{accountType === 'admin' ? (
						<label className="grid gap-2 text-sm font-semibold">
							<span>Admin provisioning secret</span>
							<input
								name="adminProvisioningSecret"
								type="password"
								placeholder="Enter the admin provisioning secret"
								value={form.adminProvisioningSecret}
								onChange={updateField}
								autoComplete="off"
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
							<p className="text-xs font-normal text-slate-300">
								Required in production. Set it as ADMIN_PROVISIONING_SECRET on the server.
							</p>
						</label>
					) : null}
					<div className="grid gap-3 sm:grid-cols-2">
						<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
							Create SIGNATURA ID
						</button>
						<button
							type="button"
							onClick={cancelPendingRegistration}
							className="rounded-xl border border-red/15 px-5 hover:border-red-400 py-3 text-sm font-bold text-red-100 transition hover:text-red-400">
							Cancel
						</button>
					</div>
				</form>
			) : null}

			{step === 'resume' ? (
				<form onSubmit={resumeSetup} className="mt-6 grid gap-4">
					<label className="grid gap-2 text-sm font-semibold">
						<span>Signatura ID</span>
						<input
							name="signaturaId"
							placeholder="SIG-XXXX-XXXX"
							value={form.signaturaId}
							onChange={updateField}
							autoComplete="username"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Handphone number</span>
						<input
							name="handphone"
							placeholder="Example: +63 917 000 0000"
							value={form.handphone}
							onChange={updateField}
							autoComplete="tel"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Email address</span>
						<input
							name="email"
							type="email"
							placeholder="Example: victor@example.com"
							value={form.email}
							onChange={updateField}
							autoComplete="email"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
							Continue
						</button>
						<button
							type="button"
							onClick={returnToLogin}
							className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Back to login
						</button>
					</div>
					<div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-4">
						<p className="text-sm leading-6 text-slate-300">
							Don&apos;t have a Signatura ID yet, or want a new account?
						</p>
						<button
							type="button"
							onClick={startNewAccountRegistration}
							className="mt-3 w-full rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:bg-red-500/15">
							Create new Signatura account
						</button>
					</div>
				</form>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{createdAccount?.signaturaId && step !== 'account' && step !== 'resume' ? (
				<RegistrationStatusCard
					statusCard={statusCard}
					signaturaId={createdAccount.signaturaId}
				/>
			) : null}

			{step === 'passkey' ? (
				<div className="mt-6">
					<PasskeyNotice />
					{accountType === 'admin' &&
					createdAccount?.id &&
					registrationSessionId ? (
						<AdminSetupQrPanel
							userId={createdAccount.id}
							registrationSessionId={registrationSessionId}
							signaturaId={createdAccount.signaturaId}
						/>
					) : null}
					<form onSubmit={createPasskey} className="mt-6 grid gap-4">
						<p className="text-sm leading-6 text-slate-300">
							Create a passkey on this device. You will confirm trusted device
							registration on the next step.
						</p>
						<div className="grid gap-3 sm:grid-cols-2">
							<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
								Create passkey
							</button>
							<button
								type="button"
								onClick={cancelPendingRegistration}
								className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
								Cancel
							</button>
						</div>
					</form>
				</div>
			) : null}

			{step === 'passkey_success' ? (
				<div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5">
					<h2 className="text-xl font-bold text-emerald-100">
						Passkey Created Successfully
					</h2>
					<dl className="mt-4 grid gap-2 text-sm">
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Signatura ID</dt>
							<dd className="font-mono text-white">{createdAccount?.signaturaId}</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Passkey Status</dt>
							<dd className="font-semibold text-white">
								{passkeySummary?.passkeyStatus || 'Active'}
							</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Credential Registered</dt>
							<dd className="font-semibold text-white">
								{passkeySummary?.credentialRegistered ? 'Yes' : 'No'}
							</dd>
						</div>
						{passkeySummary?.deviceName ? (
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Authenticator/Device</dt>
								<dd className="text-right text-white">{passkeySummary.deviceName}</dd>
							</div>
						) : null}
						{passkeySummary?.authenticatorAttachment ? (
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Authenticator Type</dt>
								<dd className="text-right capitalize text-white">
									{passkeySummary.authenticatorAttachment}
								</dd>
							</div>
						) : null}
					</dl>
					<p className="mt-4 text-sm leading-6 text-emerald-50/90">
						Your passkey is stored securely on this device. Signatura does not store
						your private key.
					</p>
					<button
						type="button"
						onClick={continueToTrustedDevice}
						className="mt-5 rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Continue to Trusted Device Registration
					</button>
				</div>
			) : null}

			{step === 'trusted_device' ? (
				<div className="mt-6">
					<form onSubmit={registerTrustedDevice} className="grid gap-4">
						<p className="text-sm leading-6 text-slate-300">
							Name this device so you can recognize it when approving Signatura
							login and QR challenges.
						</p>
						<label className="grid gap-2 text-sm font-semibold">
							<span>Device name</span>
							<input
								name="deviceName"
								placeholder="Example: Victor's laptop"
								value={form.deviceName}
								onChange={updateField}
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
						</label>
						<div className="grid gap-3 sm:grid-cols-2">
							<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
								Register trusted device
							</button>
							<button
								type="button"
								onClick={cancelPendingRegistration}
								className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
								Cancel
							</button>
						</div>
					</form>
				</div>
			) : null}

			{step === 'trusted_device_success' ? (
				<div className="mt-6 rounded-xl border border-sky-400/30 bg-sky-500/10 p-5">
					<h2 className="text-xl font-bold text-sky-100">Trusted Device Registered</h2>
					<dl className="mt-4 grid gap-2 text-sm">
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Device name</dt>
							<dd className="text-right text-white">
								{trustedDeviceSummary?.deviceName || form.deviceName}
							</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Device Status</dt>
							<dd className="font-semibold text-white">
								{trustedDeviceSummary?.deviceStatus || 'Trusted'}
							</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt className="text-slate-300">Passkey Status</dt>
							<dd className="font-semibold text-white">
								{trustedDeviceSummary?.passkeyStatus || 'Active'}
							</dd>
						</div>
					</dl>
					<p className="mt-4 text-sm leading-6 text-sky-50/90">
						This device can now approve Signatura login and QR challenges.
					</p>
					<button
						type="button"
						onClick={continueToRecovery}
						className="mt-5 rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Continue to Recovery Phrase
					</button>
				</div>
			) : null}
			{error ? (
				<div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
					<p>{error}</p>
					{existingAccount?.signaturaId ? (
						<div className="mt-3 rounded-lg border border-white/10 bg-slate-950/80 p-3">
							<p className="text-xs font-bold uppercase tracking-[0.14em] text-red-200">
								Existing SIGNATURA ID
							</p>
							<p className="mt-2 break-all font-mono text-base text-white">
								{existingAccount.signaturaId}
							</p>
							<p className="mt-2 text-xs leading-5 text-red-50/80">
								{existingAccount.linkedToCompany
									? 'This Signatura ID is already linked to this ACCURA company.'
									: isAccuraRegistration
										? accuraScopedIdMessage
										: 'This Signatura ID already exists for the submitted contact details.'}
							</p>
								{existingAccount.linkRequired ? (
									<button
										type="button"
										disabled={continuingExistingAccount}
										onClick={linkExistingIdentityToAccura}
										className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400 disabled:bg-slate-700">
										{continuingExistingAccount
											? 'Waiting for biometric approval...'
											: 'Link this ACCURA role'}
									</button>
								) : existingReturnHref ? (
									<button
									type="button"
									disabled={continuingExistingAccount}
									onClick={continueExistingAccountInAccura}
									className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400">
									{continuingExistingAccount ? 'Continuing...' : 'Continue in ACCURA'}
								</button>
							) : null}
						</div>
					) : null}
					{error.includes('Account already exists') ? (
						<div className="mt-3 space-y-3">
							<p className="text-xs leading-5 text-red-50/80">
								This email or phone is already linked to a Signatura account.
								Clearing browser data does not remove your account from
								Signatura.
							</p>
							<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
								{existingAccount?.setupIncomplete ? (
									<button
										type="button"
										disabled={continuingExistingAccount}
										onClick={continueExistingAccountSetup}
										className="rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400 disabled:bg-slate-700">
										{continuingExistingAccount
											? 'Resuming setup...'
											: 'Continue setup'}
									</button>
								) : null}
								<Link
									href={existingAccountLoginHref}
									className="rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400">
									Sign in
								</Link>
								{existingAccountDeviceHref && !existingAccount?.setupIncomplete ? (
									<Link
										href={existingAccountDeviceHref}
										className="rounded-lg border border-white/15 px-4 py-2 text-center text-xs font-bold text-white transition hover:border-red-400">
										Register this device
									</Link>
								) : null}
								{!isAccuraRegistration ? (
									<Link
										href="/login?next=/issuer"
										className="rounded-lg border border-white/15 px-4 py-2 text-center text-xs font-bold text-white transition hover:border-red-400">
										Sign in as issuer
									</Link>
								) : null}
							</div>
						</div>
					) : null}
				</div>
			) : null}

			{step === 'recovery' ? (
				<div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-300/10 p-4">
					<h2 className="font-bold text-amber-100">
						{recoveryPhrase
							? 'Recovery phrase, shown only once'
							: 'Activate your account'}
					</h2>
					{recoveryPhrase ? (
						<>
							<p className="mt-2 text-sm leading-6 text-amber-50/90">
								Write this phrase offline. It authorizes account and device recovery
								only. It does not reveal your encrypted private data.
							</p>
							<p className="mt-4 rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm leading-7 text-white">
								{recoveryPhrase}
							</p>
						</>
					) : (
						<p className="mt-2 text-sm leading-6 text-amber-50/90">
							{recoveryPhraseAlreadyIssued
								? 'Your recovery phrase was already generated in this browser session or on another device. If you saved it offline, confirm below to activate your account.'
								: 'Confirm that you saved your recovery phrase to activate your account.'}
						</p>
					)}
					<label className="mt-4 flex items-start gap-3 text-sm leading-6 text-amber-50/90">
						<input
							type="checkbox"
							checked={recoveryPhraseSaved}
							onChange={(event) => setRecoveryPhraseSaved(event.target.checked)}
							className="mt-1"
						/>
						<span>
							I saved my recovery phrase in a secure offline location.
						</span>
					</label>
					<div className="mt-5 flex flex-col gap-3 sm:flex-row">
						<button
							type="button"
							disabled={!recoveryPhraseSaved}
							onClick={activateAccount}
							className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
							{finalReturnHref ? 'Activate and continue registration' : 'Activate account'}
						</button>
						<button
							type="button"
							onClick={cancelPendingRegistration}
							className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Cancel setup
						</button>
					</div>
				</div>
			) : null}

			{step === 'complete' ? (
				<div className="mt-6">
					{isAccuraRegistration && shouldDeferAccuraReturnToDesktop(serverReturnUrl, true) ? (
						<div className="mb-4 rounded-xl border border-sky-400/40 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50">
							<p className="font-bold text-sky-100">Return to ACCURA on your computer</p>
							<p className="mt-2">
								Phone registration is complete. Return to the ACCURA registration page on your
								computer — it should continue automatically within a few seconds.
							</p>
							<p className="mt-3 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-white">
								{createdAccount?.signaturaId || form.signaturaId}
							</p>
						</div>
					) : null}
					<div className="flex flex-col gap-3 sm:flex-row">
					{finalReturnHref ? (
						<a
							href={finalReturnHref}
							className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
							Continue registration in ACCURA
						</a>
					) : (
						<Link
							href={nextPath || '/signatura/dashboard'}
							className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
							Open main dashboard
						</Link>
					)}
					<Link
						href={trustedDevicesHref}
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-amber-50 transition hover:border-red-400 hover:text-white">
						View trusted devices
					</Link>
					</div>
				</div>
			) : null}

				{!isDeviceSetup ? (
					<div className="mt-6 border-t border-white/10 pt-5">
						{canShowIssuerRegistrationLink ? (
							<Link
							href={issuerRegisterHref}
							className="mb-3 inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Create issuer Signatura ID
						</Link>
					) : null}
					{isAccuraRegistration ? null : accountType === 'admin' ? (
						<Link
							href="/login?next=/admin"
							className="text-sm font-semibold text-slate-300 transition hover:text-white">
							Already an admin? Sign in to /admin
						</Link>
					) : (
						<Link
							href="/login?next=/issuer"
							className="text-sm font-semibold text-slate-300 transition hover:text-white">
							Already an issuer? Sign in to /issuer
						</Link>
					)}
				</div>
			) : null}
		</div>
	);
}

export { RegisterPasskeyForm };

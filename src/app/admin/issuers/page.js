'use client';

import { useEffect, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';
import { RegisterIssuerModal } from '@/components/RegisterIssuerModal';

const deliveryChannels = [
	['VIBER', 'Viber'],
	['MESSENGER', 'Messenger'],
	['WHATSAPP', 'WhatsApp'],
	['SMS', 'SMS'],
	['SECURE_ENTERPRISE_CHANNEL', 'Secure enterprise channel'],
];

function toIssuerRow(registeredIssuer) {
	return {
		id: registeredIssuer.issuerId,
		tenantId: registeredIssuer.tenantId,
		tenantName: registeredIssuer.registeredName,
		name: registeredIssuer.registeredName,
		type: registeredIssuer.issuerType,
		address: registeredIssuer.address,
		registrationNumber: registeredIssuer.registrationNumber,
		registrationDate: registeredIssuer.registrationDate,
		status: 'active',
		createdAt: new Date().toISOString(),
		apiClient: registeredIssuer.apiClient,
	};
}

async function readJsonResponse(response) {
	const text = await response.text();

	if (!text) {
		return {};
	}

	try {
		return JSON.parse(text);
	} catch {
		return { error: text };
	}
}

export default function AdminIssuers() {
	const [issuers, setIssuers] = useState([]);
	const [latestCredentials, setLatestCredentials] = useState(null);
	const [inviteIssuer, setInviteIssuer] = useState(null);
	const [inviteError, setInviteError] = useState('');
	const [isInviting, setIsInviting] = useState(false);
	const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);
	const [status, setStatus] = useState('Loading issuers...');
	const [error, setError] = useState('');
	const [generatedAuthorizationCode, setGeneratedAuthorizationCode] = useState(null);
	const [isGeneratingCode, setIsGeneratingCode] = useState(false);

	useEffect(() => {
		let isMounted = true;

		async function loadIssuers() {
			try {
				const response = await fetch('/api/admin/issuers');
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Unable to load issuers');
				if (!isMounted) return;
				setIssuers(data.issuers || []);
				setStatus('');
			} catch (loadError) {
				if (!isMounted) return;
				setError(loadError.message);
				setStatus('');
			}
		}

		loadIssuers();

		return () => {
			isMounted = false;
		};
	}, []);

	function handleRegistered(registeredIssuer) {
		const row = toIssuerRow(registeredIssuer);
		setIssuers((currentIssuers) => [
			row,
			...currentIssuers.filter((issuer) => issuer.id !== row.id),
		]);
		setLatestCredentials({
			issuerId: row.id,
			name: row.name,
			apiClient: registeredIssuer.apiClient,
			authorizationCode: registeredIssuer.authorizationCode,
			deliveryChannel: registeredIssuer.deliveryChannel,
			invitation: registeredIssuer.invitation,
			invitationError: registeredIssuer.invitationError,
		});
		setError('');
		setStatus('');
	}

	async function copyInviteUrl(url) {
		try {
			await navigator.clipboard.writeText(url);
			setCopiedInviteUrl(true);
			window.setTimeout(() => setCopiedInviteUrl(false), 1800);
		} catch {
			setCopiedInviteUrl(false);
		}
	}

	async function handleGenerateAuthorizationCode() {
		setIsGeneratingCode(true);
		setError('');

		try {
			const response = await fetch('/api/admin/issuer-authorization-codes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ label: 'Issuer Signatura ID creation' }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Unable to generate issuer authorization code');
			}

			setGeneratedAuthorizationCode(data);
		} catch (generateError) {
			setError(
				generateError instanceof Error
					? generateError.message
					: 'Unable to generate issuer authorization code',
			);
		} finally {
			setIsGeneratingCode(false);
		}
	}

	async function handleInviteSubmit(event) {
		event.preventDefault();
		if (!inviteIssuer) return;

		setInviteError('');
		setIsInviting(true);

		const formData = new FormData(event.currentTarget);
		const payload = {
			tenantId: inviteIssuer.tenantId,
			issuerId: inviteIssuer.id,
			deliveryChannel: formData.get('deliveryChannel'),
			expiresInHours: formData.get('expiresInHours'),
			role: 'ISSUER_ADMIN',
		};

		try {
			const response = await fetch('/api/issuer-invitations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const data = await readJsonResponse(response);

			if (!response.ok) {
				throw new Error(data.error || 'Unable to create issuer invite');
			}

			setLatestCredentials({
				issuerId: inviteIssuer.id,
				name: inviteIssuer.name,
				apiClient: null,
				deliveryChannel: payload.deliveryChannel,
				invitation: data,
				invitationError: null,
			});
			setInviteIssuer(null);
		} catch (submitError) {
			setInviteError(submitError.message);
		} finally {
			setIsInviting(false);
		}
	}

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-10">
				<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name="bank" className="h-6 w-6" />
						</div>
						<h1 className="text-3xl font-bold text-white">Manage Issuers</h1>
						<p className="mt-4 max-w-2xl text-slate-300">
							View, onboard, and manage all issuer tenants on the platform.
						</p>
					</div>
					<RegisterIssuerModal onRegistered={handleRegistered} />
				</div>
			</section>

			{status ? (
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5 text-sm text-slate-300">
					{status}
				</div>
			) : null}

			{error ? (
				<div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-100">
					{error}
				</div>
			) : null}

			{generatedAuthorizationCode ? (
				<section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
						Issuer authorization code
					</p>
					<h2 className="mt-2 text-xl font-black text-white">
						{generatedAuthorizationCode.code}
					</h2>
					<p className="mt-3 text-sm text-emerald-50/90">
						Share this code with authorized issuer onboarding staff. It will be accepted for issuer Signatura ID creation until it expires on{' '}
						{new Date(generatedAuthorizationCode.expiresAt).toLocaleString()}.
					</p>
				</section>
			) : null}

			{latestCredentials ? (
				<section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
						New issuer credentials
					</p>
					<h2 className="mt-2 text-xl font-black text-white">
						{latestCredentials.name}
					</h2>
					{latestCredentials.apiClient ? (
						<>
							<div className="mt-4 grid gap-2 break-all text-sm text-emerald-50">
								<p>Issuer ID: {latestCredentials.issuerId}</p>
								<p>API key: {latestCredentials.apiClient.apiKey}</p>
								<p>Client secret: {latestCredentials.apiClient.clientSecret}</p>
							</div>
							{latestCredentials.authorizationCode ? (
								<div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50">
									<p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
										Issuer authorization code
									</p>
									<p className="mt-2 break-all font-mono text-white">
										{latestCredentials.authorizationCode.code}
									</p>
									<p className="mt-2 text-xs text-emerald-100/80">
										This code is bound to issuer {latestCredentials.issuerId} and is required for issuer Signatura ID creation.
									</p>
								</div>
							) : null}
							<p className="mt-4 text-xs leading-5 text-emerald-100/80">
								Store these securely. They are shown only after registration for
								setup and should not be sent through public messaging channels.
							</p>
						</>
					) : null}

					<div className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-4">
						<p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
							Issuer admin activation
						</p>
						<div className="mt-3 grid gap-2 text-sm text-emerald-50">
							<p>Delivery channel: {latestCredentials.deliveryChannel}</p>
						</div>

						{latestCredentials.invitation ? (
							<>
								<p className="mt-4 text-xs leading-5 text-emerald-100/80">
									Send only this activation link through the selected channel.
									The token is single-use, expires, and is stored hashed.
								</p>
								<div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
									<a
										href={latestCredentials.invitation.activationUrl}
										target="_blank"
										rel="noreferrer"
										className="block min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white underline decoration-red-400/60 underline-offset-4 transition hover:border-red-400 hover:text-red-200">
										{latestCredentials.invitation.activationUrl}
									</a>
									<button
										type="button"
										onClick={() =>
											copyInviteUrl(
												latestCredentials.invitation.activationUrl,
											)
										}
										className="rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-white transition hover:border-red-400 hover:text-red-200">
										{copiedInviteUrl ? 'Copied' : 'Copy link'}
									</button>
								</div>
							</>
						) : (
							<div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
								Issuer was registered, but the invite was not created:{' '}
								{latestCredentials.invitationError ||
									'Invitation service unavailable'}
							</div>
						)}
					</div>
				</section>
			) : null}

			{issuers.length > 0 ? (
				<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
								Issuer registry
							</p>
							<h2 className="mt-2 text-2xl font-black text-white">
								Registered issuers
							</h2>
						</div>
						<p className="text-sm text-slate-400">
							{issuers.length} issuer{issuers.length === 1 ? '' : 's'}
						</p>
					</div>

					<div className="mt-6 overflow-hidden rounded-xl border border-white/10">
						<div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr] gap-4 bg-slate-950/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
							<span>Issuer</span>
							<span>Tenant</span>
							<span>Registration</span>
							<span>Status</span>
							<span>Action</span>
						</div>
						<div className="divide-y divide-white/10">
							{issuers.map((issuer) => (
								<article
									key={issuer.id}
									className="grid gap-4 px-4 py-4 text-sm text-slate-200 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr]">
									<div>
										<p className="font-bold text-white">{issuer.name}</p>
										<p className="mt-1 text-xs text-slate-400">
											{issuer.type || 'Issuer'}
										</p>
										<p className="mt-2 text-xs leading-5 text-slate-500">
											{issuer.address || 'No address recorded'}
										</p>
									</div>
									<div className="break-all">
										<p>{issuer.tenantName}</p>
										<p className="mt-1 text-xs text-slate-500">
											{issuer.tenantId}
										</p>
									</div>
									<div>
										<p>{issuer.registrationNumber || 'Not provided'}</p>
										<p className="mt-1 text-xs text-slate-500">
											{issuer.registrationDate || 'No date'}
										</p>
									</div>
									<div>
										<span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
											{issuer.status || 'active'}
										</span>
									</div>
									<div>
										<button
											type="button"
											onClick={() => {
												setInviteIssuer(issuer);
												setInviteError('');
											}}
											className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
											Create invite
										</button>
									</div>
								</article>
							))}
						</div>
					</div>
				</section>
			) : !status ? (
				<div className="rounded-2xl border border-dashed border-red-500/40 bg-red-500/10 p-12 text-center">
					<div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-red-500/40 bg-slate-950 text-red-300">
						<PortalIcon name="bank" className="h-7 w-7" />
					</div>
					<h2 className="text-xl font-bold text-white">
						No issuers registered yet
					</h2>
					<p className="mt-2 text-slate-300">
						Register an issuer to show it in this Dev Admin issuer registry.
					</p>
					<div className="mt-6">
						<div className="flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={handleGenerateAuthorizationCode}
								disabled={isGeneratingCode}
								className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-100 disabled:cursor-not-allowed disabled:bg-slate-800">
								{isGeneratingCode ? 'Generating...' : 'Generate issuer code'}
							</button>
							<RegisterIssuerModal onRegistered={handleRegistered} />
						</div>
					</div>
				</div>
			) : null}

			{inviteIssuer ? (
				<div className="fixed inset-0 z-100 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
					<div className="grid min-h-full place-items-start sm:place-items-center">
						<div
							className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-[0_0_90px_rgba(248,35,35,0.22)]"
							role="dialog"
							aria-modal="true"
							aria-labelledby="create-invite-title">
							<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
								<div>
									<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
										Issuer admin activation
									</p>
									<h2
										id="create-invite-title"
										className="mt-1 text-xl font-black text-white">
										Create invite for {inviteIssuer.name}
									</h2>
								</div>
								<button
									type="button"
									onClick={() => setInviteIssuer(null)}
									className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:border-red-400 hover:text-white"
									aria-label="Close create invite modal">
									X
								</button>
							</div>

							<form onSubmit={handleInviteSubmit} className="grid gap-5 p-5">
								<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
									Messaging apps deliver the activation link only. Identity is
									confirmed when the issuer registers this device with
									biometric/passkey security.
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="grid gap-2">
										<label
											htmlFor="invite-channel"
											className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
											Delivery channel
										</label>
										<select
											id="invite-channel"
											name="deliveryChannel"
											required
											className="rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500">
											{deliveryChannels.map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
										</select>
									</div>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="grid gap-2">
										<label
											htmlFor="invite-expiry"
											className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
											Invite expiry
										</label>
										<select
											id="invite-expiry"
											name="expiresInHours"
											required
											className="rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500">
											<option value="24">24 hours</option>
											<option value="72">72 hours</option>
											<option value="168">7 days</option>
										</select>
									</div>
								</div>

								{inviteError ? (
									<div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
										{inviteError}
									</div>
								) : null}

								<div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
									<button
										type="button"
										onClick={() => setInviteIssuer(null)}
										className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
										Cancel
									</button>
									<button
										type="submit"
										disabled={isInviting}
										className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
										{isInviting ? 'Creating...' : 'Create Activation Invite'}
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

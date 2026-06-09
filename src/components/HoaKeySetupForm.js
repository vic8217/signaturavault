'use client';

import { useMemo, useState } from 'react';
import { reverifyPasskey } from '@/lib/passkey-client';

const MIN_KEY_LENGTH = 16;

function bytesToBase64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bufferToBase64url(buffer) {
	return bytesToBase64url(new Uint8Array(buffer));
}

function bufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function randomBase64url(byteLength = 32) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return bytesToBase64url(bytes);
}

async function sha256Hex(value) {
	const input = new TextEncoder().encode(value);
	return bufferToHex(await crypto.subtle.digest('SHA-256', input));
}

async function buildWrappedEnvelope(hoaKey, hoaId) {
	const salt = new Uint8Array(16);
	const iv = new Uint8Array(12);
	const dataKey = new Uint8Array(32);
	crypto.getRandomValues(salt);
	crypto.getRandomValues(iv);
	crypto.getRandomValues(dataKey);

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(hoaKey),
		'PBKDF2',
		false,
		['deriveKey'],
	);
	const wrappingKey = await crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: new TextEncoder().encode(`${hoaId}:${bytesToBase64url(salt)}`),
			iterations: 150000,
			hash: 'SHA-256',
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt'],
	);
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, tagLength: 128 },
		wrappingKey,
		dataKey,
	);
	dataKey.fill(0);

	const encryptedBytes = new Uint8Array(encrypted);
	const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
	const tag = encryptedBytes.slice(encryptedBytes.length - 16);

	return {
		algorithm: 'AES-256-GCM',
		wrappedKey: bytesToBase64url(ciphertext),
		salt: bytesToBase64url(salt),
		iv: bytesToBase64url(iv),
		tag: bytesToBase64url(tag),
		kdfName: 'PBKDF2-SHA256',
		kdfParams: { iterations: 150000, keyLength: 32, hash: 'SHA-256' },
	};
}

function safeReturnTo(value) {
	try {
		const parsed = new URL(value);
		if (!['http:', 'https:'].includes(parsed.protocol)) return '';
		return parsed.toString();
	} catch {
		return '';
	}
}

function havenKeyEntryUrl(returnTo) {
	const parsed = new URL(returnTo);
	const nextPath = parsed.searchParams.get('next');
	if (nextPath?.startsWith('/')) return new URL(nextPath, parsed.origin).toString();
	return parsed.origin;
}

export function HoaKeySetupForm({ hoaId, tenantId, returnTo }) {
	const [mode, setMode] = useState('generate');
	const [hoaKey, setHoaKey] = useState('');
	const [revealed, setRevealed] = useState(false);
	const [saved, setSaved] = useState(false);
	const [understood, setUnderstood] = useState(false);
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [needsVerification, setNeedsVerification] = useState(false);
	const [isVerifying, setIsVerifying] = useState(false);
	const normalizedReturnTo = useMemo(() => safeReturnTo(returnTo), [returnTo]);
	const canEnroll = hoaKey.trim().length >= MIN_KEY_LENGTH && saved && understood && !isSubmitting;

	function generateKey() {
		setMode('generate');
		setHoaKey(randomBase64url(32));
		setRevealed(false);
		setSaved(false);
		setUnderstood(false);
		setStatus('Generated a new HOA encryption key. Save it before enrolling.');
		setError('');
		setNeedsVerification(false);
	}

	async function verifyPasskey() {
		setIsVerifying(true);
		setError('');
		setStatus('Approve passkey verification on this device.');
		try {
			await reverifyPasskey();
			setNeedsVerification(false);
			setStatus('Passkey verified. Press Enroll key reference again to continue.');
		} catch (verifyError) {
			setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify passkey.');
			setStatus('');
		} finally {
			setIsVerifying(false);
		}
	}

	async function enroll() {
		const trimmedKey = hoaKey.trim();
		if (!canEnroll) return;
		setIsSubmitting(true);
		setStatus('Enrolling key reference with Signatura...');
		setError('');
		setNeedsVerification(false);
		try {
			const unlockProof = await sha256Hex(trimmedKey);
			const envelope = await buildWrappedEnvelope(trimmedKey, tenantId || hoaId);
			const response = await fetch('/api/hoa-key/setup/enroll', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tenantId, hoaId, envelope, unlockProof }),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body?.ok === false) {
				throw new Error(body?.error || 'Unable to enroll HOA key.');
			}
			const keyRef = body.key?.keyRef;
			if (!keyRef) throw new Error('Signatura did not return a key reference.');
			if (body.key?.alreadyEnrolled) {
				setStatus('An HOA key is already enrolled. Returning to HavenxSig to unlock with the saved key...');
				if (normalizedReturnTo) {
					window.location.href = havenKeyEntryUrl(normalizedReturnTo);
				} else {
					setStatus('An HOA key is already enrolled. Return to HavenxSig and unlock with the saved key.');
				}
				return;
			}
			setStatus('Key reference enrolled. Returning to HavenxSig...');
			if (normalizedReturnTo) {
				const destination = new URL(normalizedReturnTo);
				destination.hash = new URLSearchParams({ hoaKey: trimmedKey, keyRef }).toString();
				window.location.href = destination.toString();
			} else {
				setStatus('Key reference enrolled. Return to HavenxSig and unlock with the saved key.');
			}
		} catch (setupError) {
			const message = setupError instanceof Error ? setupError.message : 'Unable to enroll HOA key.';
			setError(message);
			setNeedsVerification(message.includes('Recent passkey verification required'));
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">HOA encryption setup</p>
			<h1 className="mt-2 text-3xl font-black">Create HOA encryption key</h1>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				This key reference is used for Zero Trust Level 2 private-field access. Signatura stores authorization metadata and encrypted envelopes, not raw private-field plaintext.
			</p>

			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onClick={generateKey}
					className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
					Generate key
				</button>
				<button
					type="button"
					onClick={() => {
						setMode('import');
						setHoaKey('');
						setStatus('Paste the HOA-approved key, then save and enroll it.');
					}}
					className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-red-400">
					Import existing key
				</button>
			</div>

			<div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
				<p className="text-sm font-bold text-red-100">This key is shown only during setup.</p>
				<p className="mt-2 text-sm leading-6 text-red-50/80">
					Save it in the HOA-controlled vault. If it is lost, access to records encrypted with that key may require tenant recovery or re-encryption procedures.
				</p>
			</div>

			<div className="mt-6 grid gap-3">
				<label className="grid gap-2 text-sm font-semibold">
					<span>{mode === 'import' ? 'Imported HOA encryption key' : 'Generated HOA encryption key'}</span>
					<input
						value={hoaKey}
						onChange={(event) => setHoaKey(event.target.value)}
						readOnly={mode === 'generate'}
						className="rounded-xl border border-white/10 bg-white px-4 py-3 font-mono text-sm text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						type={revealed ? 'text' : 'password'}
						placeholder="Generate or paste a strong HOA key"
					/>
				</label>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={() => setRevealed((value) => !value)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white">
						{revealed ? 'Hide key' : 'Reveal key'}
					</button>
					<button type="button" onClick={() => navigator.clipboard?.writeText(hoaKey)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white">
						Copy key
					</button>
				</div>
			</div>

			<div className="mt-6 grid gap-3 text-sm text-slate-200">
				<label className="flex gap-3">
					<input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="mt-1" />
					<span>I saved this key in the HOA-controlled vault.</span>
				</label>
				<label className="flex gap-3">
					<input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} className="mt-1" />
					<span>I understand recovery depends on the HOA-controlled key process.</span>
				</label>
			</div>

			<button
				type="button"
				disabled={!canEnroll}
				onClick={enroll}
				className="mt-6 w-full rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
				{isSubmitting ? 'Enrolling...' : 'Enroll key reference'}
			</button>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{needsVerification ? (
				<button
					type="button"
					onClick={verifyPasskey}
					disabled={isVerifying}
					className="mt-4 w-full rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isVerifying ? 'Verifying...' : 'Verify with passkey'}
				</button>
			) : null}
		</section>
	);
}

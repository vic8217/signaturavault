'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const emptyProfile = {
	name: '',
	type: '',
	registrationDate: '',
	logoUrl: '',
	website: '',
	description: '',
	acceptsRequests: false,
};

function IssuerProfileForm() {
	const [profile, setProfile] = useState(emptyProfile);
	const [status, setStatus] = useState('Loading issuer profile...');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let isMounted = true;

		async function loadProfile() {
			try {
				const response = await fetch('/api/issuer/profile');
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Unable to load issuer profile');
				if (!isMounted) return;
				setProfile({ ...emptyProfile, ...data.profile });
				setStatus('');
			} catch (loadError) {
				if (!isMounted) return;
				setError(loadError.message);
				setStatus('');
			}
		}

		loadProfile();

		return () => {
			isMounted = false;
		};
	}, []);

	function updateField(field, value) {
		setProfile((current) => ({ ...current, [field]: value }));
	}

	async function saveProfile(event) {
		event.preventDefault();
		setIsSaving(true);
		setError('');
		setStatus('Saving issuer profile...');

		try {
			const response = await fetch('/api/issuer/profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(profile),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Unable to save issuer profile');
			setProfile({ ...emptyProfile, ...data.profile });
			setStatus('Issuer profile saved.');
		} catch (saveError) {
			setError(saveError.message);
			setStatus('');
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<form
			onSubmit={saveProfile}
			className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
			<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
				<div>
					<p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-300">
						Issuer profile
					</p>
					<h2 className="mt-2 text-2xl font-bold text-white">
						Organization details
					</h2>
					<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
						These details appear across issuer portal pages and can be used on
						digital document templates, verification pages, and issuer-facing workflows.
					</p>
				</div>
				{profile.logoUrl ? (
					<Image
						src={profile.logoUrl}
						alt={`${profile.name || 'Issuer'} logo`}
						width={80}
						height={80}
						unoptimized
						className="h-20 w-20 rounded-xl border border-white/10 bg-slate-950 object-contain p-2"
					/>
				) : (
					<div className="grid h-20 w-20 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-xl font-bold text-red-200">
						{(profile.name || 'I')
							.split(/\s+/)
							.slice(0, 2)
							.map((part) => part[0])
							.join('')
							.toUpperCase()}
					</div>
				)}
			</div>

			{status ? (
				<p className="mt-5 rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
					{status}
				</p>
			) : null}
			{error ? (
				<p className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
					{error}
				</p>
			) : null}

			<div className="mt-6 grid gap-4 lg:grid-cols-2">
				<label className="grid gap-2 text-sm font-semibold text-slate-200">
					Issuer name
					<input
						value={profile.name}
						onChange={(event) => updateField('name', event.target.value)}
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
				<label className="grid gap-2 text-sm font-semibold text-slate-200">
					Issuer type
					<input
						value={profile.type}
						onChange={(event) => updateField('type', event.target.value)}
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
					<label className="grid gap-2 text-sm font-semibold text-slate-200">
						Logo URL
					<input
						value={profile.logoUrl}
						onChange={(event) => updateField('logoUrl', event.target.value)}
						placeholder="https://example.com/logo.png"
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
					<label className="grid gap-2 text-sm font-semibold text-slate-200">
						Registration date
					<input
						type="date"
						value={String(profile.registrationDate || '').slice(0, 10)}
						onChange={(event) =>
							updateField('registrationDate', event.target.value)
						}
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
				<label className="grid gap-2 text-sm font-semibold text-slate-200 lg:col-span-2">
					Website
					<input
						value={profile.website}
						onChange={(event) => updateField('website', event.target.value)}
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
					<label className="grid gap-2 text-sm font-semibold text-slate-200 lg:col-span-2">
					Profile notes
					<textarea
						value={profile.description}
						onChange={(event) => updateField('description', event.target.value)}
						rows={4}
						className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
					/>
				</label>
				<label className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 lg:col-span-2">
					<input
						type="checkbox"
						checked={Boolean(profile.acceptsRequests)}
						onChange={(event) =>
							updateField('acceptsRequests', event.target.checked)
						}
						className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-red-500 focus:ring-red-400"
					/>
					<span>
						<span className="font-semibold text-white">
							Accept document requests from owners
						</span>
						<span className="mt-1 block text-xs leading-5 text-slate-400">
							When enabled, this issuer appears in the owner request lookup list.
							Only issuer admins can change this setting.
						</span>
					</span>
				</label>
			</div>

			<div className="mt-6 flex justify-end">
				<button
					type="submit"
					disabled={isSaving}
					className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700">
					{isSaving ? 'Saving...' : 'Save Profile'}
				</button>
			</div>
		</form>
	);
}

export { IssuerProfileForm };

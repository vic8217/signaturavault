'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

function normalize(value) {
	return String(value || '').trim().toLowerCase();
}

function issuerSlug(type) {
	return normalize(type || 'Others').replace(/[^a-z0-9]+/g, '-');
}

function supportsVoiceSearch() {
	if (typeof window === 'undefined') return false;
	return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function statusTone(status) {
	return normalize(status) === 'active'
		? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
		: 'border-white/10 bg-slate-950/60 text-slate-300';
}

export function WalletIssuerDirectory({ issuers = [], classifications = [] }) {
	const [search, setSearch] = useState('');
	const [classification, setClassification] = useState('all');
	const [isListening, setIsListening] = useState(false);
	const [voiceMessage, setVoiceMessage] = useState('');
	const [voiceAvailable, setVoiceAvailable] = useState(false);

	useEffect(() => {
		setVoiceAvailable(supportsVoiceSearch());
	}, []);

	const filteredIssuers = useMemo(() => {
		const query = normalize(search);
		return issuers.filter((issuer) => {
			const type = issuer.type || 'Others';
			if (classification !== 'all' && issuerSlug(type) !== classification) {
				return false;
			}
			if (!query) return true;

			return [
				issuer.name,
				issuer.type,
				issuer.address,
				issuer.registration_number,
				issuer.status,
			]
				.map(normalize)
				.join(' ')
				.includes(query);
		});
	}, [classification, issuers, search]);

	function startVoiceSearch() {
		setVoiceMessage('');

		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognition) {
			setVoiceMessage('Voice search is not supported in this browser.');
			return;
		}

		const recognition = new SpeechRecognition();
		recognition.lang = 'en-US';
		recognition.interimResults = false;
		recognition.maxAlternatives = 1;

		recognition.onstart = () => {
			setIsListening(true);
			setVoiceMessage('Listening...');
		};
		recognition.onresult = (event) => {
			const transcript = event.results?.[0]?.[0]?.transcript || '';
			setSearch(transcript);
			setVoiceMessage(transcript ? `Voice search: ${transcript}` : '');
		};
		recognition.onerror = () => {
			setVoiceMessage('Voice search could not hear a search term.');
		};
		recognition.onend = () => {
			setIsListening(false);
		};

		recognition.start();
	}

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					Issuers
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">
					Trusted issuer directory
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Search registered issuers, filter by classification, and review
					issuer identity before accepting or requesting credentials.
				</p>
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
				<div className="grid gap-3 lg:grid-cols-[1fr_240px_auto]">
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
							Search issuer
						</span>
						<div className="mt-2 flex gap-2">
							<input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search by name, address, registration, or status"
								className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-red-400"
							/>
							<button
								type="button"
								onClick={startVoiceSearch}
								disabled={!voiceAvailable || isListening}
								className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-950/70 text-red-300 transition hover:border-red-400 hover:text-white disabled:text-slate-600"
								title={
									voiceAvailable
										? 'Voice search'
										: 'Voice search is not supported in this browser'
								}>
								<PortalIcon name="mic" className="h-5 w-5" />
							</button>
						</div>
					</label>

					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
							Classification
						</span>
						<select
							value={classification}
							onChange={(event) => setClassification(event.target.value)}
							className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-red-400">
							<option value="all">All classifications</option>
							{classifications.map((item) => (
								<option key={item.slug} value={item.slug}>
									{item.type}
								</option>
							))}
						</select>
					</label>

					<div className="flex items-end">
						<button
							type="button"
							onClick={() => {
								setSearch('');
								setClassification('all');
								setVoiceMessage('');
							}}
							className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-200 lg:w-auto">
							Clear
						</button>
					</div>
				</div>
				{voiceMessage ? (
					<p className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
						{voiceMessage}
					</p>
				) : null}
			</section>

			<section className="grid gap-4">
				<div className="flex items-center justify-between gap-3 px-1">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						Registered issuers
					</p>
					<p className="text-sm text-slate-400">
						{filteredIssuers.length} of {issuers.length}
					</p>
				</div>

				{filteredIssuers.map((issuer) => (
					<Link
						key={issuer.id}
						href={`/wallet/issuers/issuer/${issuer.id}`}
						className="block rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-red-400 hover:bg-white/[0.06]">
						<div className="flex gap-4">
							<div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name="bank" className="h-6 w-6" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<h2 className="text-lg font-bold text-white">{issuer.name}</h2>
										<p className="mt-1 text-sm text-slate-400">
											{issuer.type || 'Issuer'}
										</p>
									</div>
									<span
										className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${statusTone(
											issuer.status,
										)}`}>
										{issuer.status || 'active'}
									</span>
								</div>
								<div className="mt-3 grid gap-1 text-sm leading-6 text-slate-300">
									<p>{issuer.address || 'No address recorded'}</p>
									<p className="break-all text-xs text-slate-500">
										Registration: {issuer.registration_number || 'Not provided'}
									</p>
								</div>
								<div className="mt-4 flex flex-wrap gap-2">
									<span className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">
										View documents
									</span>
									<span className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">
										{issuer.type || 'Issuer'}
									</span>
								</div>
							</div>
						</div>
					</Link>
				))}

				{filteredIssuers.length === 0 ? (
					<article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
						<div className="flex gap-4">
							<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name="bank" className="h-5 w-5" />
							</div>
							<div>
								<h2 className="font-bold text-white">No issuers found</h2>
								<p className="mt-2 text-sm leading-6 text-slate-300">
									Try another search term or classification.
								</p>
							</div>
						</div>
					</article>
				) : null}
			</section>
		</div>
	);
}

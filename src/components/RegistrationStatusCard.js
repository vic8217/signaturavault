'use client';

export function RegistrationStatusCard({ statusCard, signaturaId = '' }) {
	if (!statusCard) return null;

	const rows = [
		{ label: 'Signatura ID', value: statusCard.signaturaIdStatus },
		{ label: 'Passkey', value: statusCard.passkeyStatus },
		{ label: 'Trusted Device', value: statusCard.trustedDeviceStatus },
		{ label: 'Recovery Phrase', value: statusCard.recoveryPhraseStatus },
		{ label: 'Account Status', value: statusCard.accountStatus },
	];

	return (
		<div className="mt-4 rounded-xl border border-white/15 bg-slate-900/70 p-4 text-sm text-slate-100">
			<p className="text-xs font-bold uppercase tracking-[0.16em] text-red-200">
				Registration status
			</p>
			{signaturaId ? (
				<p className="mt-2 break-all font-mono text-xs text-slate-300">
					{signaturaId}
				</p>
			) : null}
			<dl className="mt-3 grid gap-2">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-center justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
						<dt className="text-slate-300">{row.label}</dt>
						<dd className="font-semibold text-white">{row.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

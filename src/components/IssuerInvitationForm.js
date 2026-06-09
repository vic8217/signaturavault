'use client';

import { useState } from 'react';

const channels = [
	['VIBER', 'Viber'],
	['MESSENGER', 'Messenger'],
	['WHATSAPP', 'WhatsApp'],
	['SMS', 'SMS'],
	['SECURE_ENTERPRISE_CHANNEL', 'Secure enterprise channel'],
];

function IssuerInvitationForm() {
		const [form, setForm] = useState({
			tenantId: '',
			issuerId: '',
			role: 'ISSUER_STAFF',
			deliveryChannel: 'SECURE_ENTERPRISE_CHANNEL',
			expiresInHours: '72',
		});
	const [result, setResult] = useState(null);
	const [error, setError] = useState('');

	function updateField(event) {
		setForm((current) => ({
			...current,
			[event.target.name]: event.target.value,
		}));
	}

	async function submit(event) {
		event.preventDefault();
		setError('');
		setResult(null);

		try {
			const response = await fetch('/api/issuer-invitations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setResult(data);
		} catch (inviteError) {
			setError(inviteError.message);
		}
	}

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-8">
			<h2 className="text-xl font-bold text-slate-900">
				Invite issuer user
			</h2>
			<p className="mt-3 text-sm leading-7 text-slate-600">
				Messaging apps are delivery channels only. They are not proof of
				identity. Send only the activation link, never permanent passwords or
				recovery codes.
			</p>

			<form onSubmit={submit} className="mt-6 grid gap-4">
				<div className="grid gap-4 md:grid-cols-2">
					<label className="grid gap-2 text-sm font-semibold text-slate-700">
						<span>Tenant ID</span>
						<input
							name="tenantId"
							required
							value={form.tenantId}
							onChange={updateField}
							className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-red-500 focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold text-slate-700">
						<span>Issuer ID</span>
						<input
							name="issuerId"
							value={form.issuerId}
							onChange={updateField}
							className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-red-500 focus:ring-2"
						/>
					</label>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
						<label className="grid gap-2 text-sm font-semibold text-slate-700">
							<span>Role</span>
						<select
							name="role"
							value={form.role}
							onChange={updateField}
							className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-red-500 focus:ring-2">
							<option value="ISSUER_ADMIN">Issuer Admin</option>
							<option value="ISSUER_STAFF">Issuer Staff</option>
						</select>
					</label>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<label className="grid gap-2 text-sm font-semibold text-slate-700">
						<span>Delivery channel</span>
						<select
							name="deliveryChannel"
							value={form.deliveryChannel}
							onChange={updateField}
							className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-red-500 focus:ring-2">
							{channels.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</label>
					</div>

				<label className="grid gap-2 text-sm font-semibold text-slate-700">
					<span>Expires in hours</span>
					<input
						name="expiresInHours"
						type="number"
						min="1"
						max="168"
						value={form.expiresInHours}
						onChange={updateField}
						className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-red-500 focus:ring-2"
					/>
				</label>

				<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
					Create activation link
				</button>
			</form>

			{error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

			{result ? (
				<div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
					<p className="font-bold text-amber-950">Activation link created</p>
					<p className="mt-2 text-sm leading-6 text-amber-900">
						Send this link only through {result.deliveryChannel}. The token is
						single-use, expires, and is stored hashed.
					</p>
					<code className="mt-3 block break-all rounded-lg bg-white p-3 text-xs text-slate-900">
						{result.activationUrl}
					</code>
				</div>
			) : null}
		</div>
	);
}

export { IssuerInvitationForm };

'use client';

import { useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';

const issuerTypes = [
	'Educational institutions',
	'Government agencies',
	'LGU',
	'Religious organization',
	'Private organization',
	'Others',
];

const deliveryChannels = [
	['VIBER', 'Viber'],
	['MESSENGER', 'Messenger'],
	['WHATSAPP', 'WhatsApp'],
	['SMS', 'SMS'],
	['SECURE_ENTERPRISE_CHANNEL', 'Secure enterprise channel'],
];

function Field({ id, label, children }) {
	return (
		<div className="grid gap-2">
			<label
				htmlFor={id}
				className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
				{label}
			</label>
			{children}
		</div>
	);
}

const inputClass =
	'rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-red-500';

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

export function RegisterIssuerModal({ onRegistered }) {
	const [isOpen, setIsOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState('');

	function closeModal() {
		setIsOpen(false);
		setError('');
		setIsSubmitting(false);
	}

	async function handleSubmit(event) {
		event.preventDefault();
		const form = event.currentTarget;
		setError('');
		setIsSubmitting(true);

		const formData = new FormData(form);
		const issuerPayload = {
			issuerType: formData.get('issuerType'),
			registeredName: formData.get('registeredName'),
			address: formData.get('address'),
			registrationNumber: formData.get('registrationNumber'),
			registrationDate: formData.get('registrationDate'),
		};
		const invitePayload = {
			email: formData.get('issuerAdminEmail'),
			deliveryChannel: formData.get('deliveryChannel'),
			recipient: formData.get('recipient'),
			expiresInHours: formData.get('expiresInHours'),
			role: 'ISSUER_ADMIN',
		};

		try {
			const response = await fetch('/api/issuers/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(issuerPayload),
			});
			const data = await readJsonResponse(response);

			if (!response.ok) {
				throw new Error(data.error || 'Unable to register issuer');
			}

			let invitation = null;
			let invitationError = null;

			try {
				const inviteResponse = await fetch('/api/issuer-invitations', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						tenantId: data.tenantId,
						issuerId: data.issuerId,
						...invitePayload,
					}),
				});
				const inviteData = await readJsonResponse(inviteResponse);

				if (!inviteResponse.ok) {
					throw new Error(inviteData.error || 'Unable to create issuer invite');
				}

				invitation = inviteData;
			} catch (inviteCreateError) {
				invitationError = inviteCreateError.message;
			}

			onRegistered?.({
				...data,
				issuerType: issuerPayload.issuerType,
				registeredName: issuerPayload.registeredName,
				address: issuerPayload.address,
				registrationNumber: issuerPayload.registrationNumber,
				registrationDate: issuerPayload.registrationDate,
				issuerAdminEmail: invitePayload.email,
				deliveryChannel: invitePayload.deliveryChannel,
				recipient: invitePayload.recipient,
				invitation,
				invitationError,
			});
			form.reset();
			closeModal();
		} catch (submitError) {
			setError(submitError.message);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white shadow-[0_0_28px_rgba(239,68,68,0.22)] transition hover:bg-red-400">
				<PortalIcon name="bank" className="h-4 w-4" />
				Register Issuer
			</button>

			{isOpen ? (
				<div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
					<div className="grid min-h-full place-items-start sm:place-items-center">
						<div
							className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-[0_0_90px_rgba(248,35,35,0.22)]"
							role="dialog"
							aria-modal="true"
							aria-labelledby="register-issuer-title">
							<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
								<div className="flex items-center gap-3">
									<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
										<PortalIcon name="bank" className="h-5 w-5" />
									</div>
									<div>
										<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
											Admin
										</p>
										<h2
											id="register-issuer-title"
											className="text-xl font-black text-white">
											Register issuer
										</h2>
									</div>
								</div>
								<button
									type="button"
									onClick={closeModal}
									className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:border-red-400 hover:text-white"
									aria-label="Close register issuer modal">
									X
								</button>
							</div>

							<form onSubmit={handleSubmit} className="grid gap-5 p-5">
								<div className="grid gap-4 sm:grid-cols-2">
									<Field id="issuer-type" label="Type of issuer">
										<select
											id="issuer-type"
											name="issuerType"
											required
											className={inputClass}>
											<option value="">Select type</option>
											{issuerTypes.map((type) => (
												<option key={type} value={type}>
													{type}
												</option>
											))}
										</select>
									</Field>

									<Field id="registered-name" label="Registered name">
										<input
											id="registered-name"
											name="registeredName"
											required
											className={inputClass}
											placeholder="Official registered name"
										/>
									</Field>
								</div>

								<Field id="address" label="Address">
									<textarea
										id="address"
										name="address"
										rows={3}
										required
										className={`${inputClass} resize-none`}
										placeholder="Complete business or office address"
									/>
								</Field>

								<div className="grid gap-4 sm:grid-cols-2">
									<Field id="registration-number" label="SEC/DTI Registration Number">
										<input
											id="registration-number"
											name="registrationNumber"
											required
											className={inputClass}
											placeholder="Registration number"
										/>
									</Field>

									<Field id="registration-date" label="Registration Date">
										<input
											id="registration-date"
											name="registrationDate"
											type="date"
											required
											className={inputClass}
										/>
									</Field>
								</div>

								<div className="border-t border-white/10 pt-5">
									<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
										Issuer admin invitation
									</p>
									<p className="mt-2 text-xs leading-5 text-slate-400">
										The channel only delivers the activation link. It is not proof
										of identity. Do not send passwords or recovery codes.
									</p>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<Field id="issuer-admin-email" label="Issuer admin email">
										<input
											id="issuer-admin-email"
											name="issuerAdminEmail"
											type="email"
											required
											className={inputClass}
											placeholder="admin@example.edu"
										/>
									</Field>

									<Field id="delivery-channel" label="Delivery channel">
										<select
											id="delivery-channel"
											name="deliveryChannel"
											required
											className={inputClass}>
											{deliveryChannels.map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
										</select>
									</Field>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<Field id="recipient" label="Recipient handle / phone">
										<input
											id="recipient"
											name="recipient"
											required
											className={inputClass}
											placeholder="+63917..., Viber ID, Messenger handle"
										/>
									</Field>

									<Field id="expires-in-hours" label="Invite expiry">
										<select
											id="expires-in-hours"
											name="expiresInHours"
											required
											className={inputClass}>
											<option value="24">24 hours</option>
											<option value="72">72 hours</option>
											<option value="168">7 days</option>
										</select>
									</Field>
								</div>

								{error ? (
									<div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
										{error}
									</div>
								) : null}

								<div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
									<button
										type="button"
										onClick={closeModal}
										className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
										Cancel
									</button>
									<button
										type="submit"
										disabled={isSubmitting}
										className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
										{isSubmitting
											? 'Registering...'
											: 'Register Issuer & Create Invite'}
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}

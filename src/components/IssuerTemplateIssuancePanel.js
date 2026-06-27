'use client';

import { useEffect, useMemo, useState } from 'react';

function IssuerTemplateIssuancePanel() {
	const [templates, setTemplates] = useState([]);
	const [selectedId, setSelectedId] = useState('');
	const [error, setError] = useState('');
	const [message, setMessage] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [fieldValues, setFieldValues] = useState({});
	const [documentNumber, setDocumentNumber] = useState('');
	const [issuedDocument, setIssuedDocument] = useState(null);
	const [qrImage, setQrImage] = useState('');

	useEffect(() => {
		async function load() {
			try {
				const response = await fetch('/api/issuer/templates');
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				const published = (data.templates || []).filter(
					(template) => template.status === 'published',
				);
				setTemplates(published);
				setSelectedId(published[0]?.id || '');
			} catch (loadError) {
				setError(loadError.message);
			}
		}
		load();
	}, []);

	const selected = useMemo(
		() => templates.find((template) => template.id === selectedId),
		[templates, selectedId],
	);

	useEffect(() => {
		setFieldValues({});
		setDocumentNumber('');
		setIssuedDocument(null);
		setQrImage('');
	}, [selectedId]);

	useEffect(() => {
		if (!issuedDocument?.verification_url) {
			setQrImage('');
			return;
		}
		let cancelled = false;
		import('qrcode')
			.then((module) =>
				module.default.toDataURL(issuedDocument.verification_url, {
					margin: 1,
					width: 220,
					color: {
						dark: '#020617',
						light: '#ffffff',
					},
				}),
			)
			.then((image) => {
				if (!cancelled) setQrImage(image);
			})
			.catch(() => {
				if (!cancelled) setQrImage('');
			});
		return () => {
			cancelled = true;
		};
	}, [issuedDocument]);

	function updateFieldValue(key, value) {
		setFieldValues((current) => ({ ...current, [key]: value }));
	}

	async function issueDocument(event) {
		event.preventDefault();
		if (!selected) return;
		setIsSubmitting(true);
		setError('');
		setMessage('Generating verified digital credential...');
		setIssuedDocument(null);
		try {
			const response = await fetch('/api/issuer/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					templateId: selected.id,
					documentNumber,
					fieldValues,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Unable to issue digital document');
			}
			setIssuedDocument(data.document);
			setMessage('Digital document issued with verification QR.');
		} catch (submitError) {
			setError(submitError.message);
			setMessage('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-xl font-bold text-white">
						Issue from published template
					</h2>
					<p className="mt-2 text-sm leading-6 text-slate-300">
						Published templates expose their reviewed schema as digital forms.
						Uploaded samples stay templates; this step creates issued credentials.
					</p>
				</div>
				<select
					value={selectedId}
					onChange={(event) => setSelectedId(event.target.value)}
					className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-400">
					{templates.map((template) => (
						<option key={template.id} value={template.id}>
							{template.name} v{template.version}
						</option>
					))}
				</select>
			</div>

			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{!selected && !error ? (
				<p className="mt-4 rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-300">
					No published templates yet.
				</p>
			) : null}
			{selected ? (
				<form onSubmit={issueDocument} className="mt-5 space-y-5">
					<label className="grid gap-1 text-sm font-semibold text-slate-200">
						<span>Credential ID or document number</span>
						<input
							type="text"
							value={documentNumber}
							onChange={(event) => setDocumentNumber(event.target.value)}
							placeholder="Auto-generated when empty"
							className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-400"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						{selected.fields.map((field) => (
							<label
								key={field.id}
								className="grid gap-1 text-sm font-semibold text-slate-200">
								<span>
									{field.field_label}
									{field.required ? <span className="text-red-500"> *</span> : null}
								</span>
								<input
									type={field.field_type === 'date' ? 'date' : 'text'}
									required={field.required}
									value={fieldValues[field.field_key] || ''}
									onChange={(event) =>
										updateFieldValue(field.field_key, event.target.value)
									}
									className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-400"
								/>
								{field.public_visible ? (
									<span className="text-xs font-normal text-amber-200">
										Public on verification
									</span>
								) : null}
							</label>
						))}
					</div>
					<button
						type="submit"
						disabled={isSubmitting}
						className="rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-700">
						{isSubmitting ? 'Issuing...' : 'Issue digital document'}
					</button>
				</form>
			) : null}
			{message ? (
				<p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
					{message}
				</p>
			) : null}
			{issuedDocument ? (
				<div className="mt-5 grid gap-5 rounded-xl border border-white/10 bg-slate-950/70 p-4 lg:grid-cols-[auto_1fr]">
					<div className="rounded-lg bg-white p-3">
						{qrImage ? (
							<img src={qrImage} alt="Verification QR code" className="h-44 w-44" />
						) : (
							<div className="grid h-44 w-44 place-items-center text-center text-xs font-semibold text-slate-500">
								QR ready
							</div>
						)}
					</div>
					<div className="min-w-0">
						<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
							Issued credential
						</p>
						<h3 className="mt-2 text-lg font-bold text-white">
							{issuedDocument.template_name} v{issuedDocument.template_version}
						</h3>
						<dl className="mt-4 grid gap-2 text-sm text-slate-300">
							<div>
								<dt className="text-xs uppercase tracking-wide text-slate-500">
									Document number
								</dt>
								<dd className="font-mono text-slate-100">
									{issuedDocument.document_number}
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase tracking-wide text-slate-500">
									Verification URL
								</dt>
								<dd className="break-all text-slate-100">
									{issuedDocument.verification_url}
								</dd>
							</div>
						</dl>
					</div>
				</div>
			) : null}
			<div className="mt-6 rounded-xl border border-dashed border-white/15 bg-slate-950/40 p-4">
				<p className="text-sm font-bold text-white">Bulk issuance scaffold</p>
				<p className="mt-2 text-sm leading-6 text-slate-300">
					CSV bulk issuance will reuse the same published template, required-field
					validation, encrypted field storage, document hashing, and verification QR
					generation for every row.
				</p>
			</div>
		</section>
	);
}

export { IssuerTemplateIssuancePanel };

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';
import {
	ENCRYPTION_NOT_READY_MESSAGE,
	encryptDocumentRequestFields,
	isDocumentRequestEncryptionReady,
} from '@/lib/document-request-encryption';

const STATUS_LABELS = {
	pending: 'Pending',
	approved: 'Approved',
	denied: 'Denied',
	issued: 'Issued',
	cancelled: 'Cancelled',
};

const STATUS_STYLES = {
	pending: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
	approved: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
	denied: 'border-red-400/30 bg-red-400/10 text-red-100',
	issued: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
	cancelled: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
};

function emptyFormValues(fields = []) {
	return fields.reduce((values, field) => {
		values[field.fieldKey] = '';
		return values;
	}, {});
}

function DocumentRequestsPanel() {
	const [requests, setRequests] = useState([]);
	const [issuers, setIssuers] = useState([]);
	const [documentTypes, setDocumentTypes] = useState([]);
	const [formSchema, setFormSchema] = useState(null);
	const [selectedIssuerId, setSelectedIssuerId] = useState('');
	const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState('');
	const [formValues, setFormValues] = useState({});
	const [showRequestForm, setShowRequestForm] = useState(false);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [cancellingId, setCancellingId] = useState('');
	const [selectedRequestId, setSelectedRequestId] = useState('');
	const [requestDetail, setRequestDetail] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [credentials, setCredentials] = useState([]);
	const [credentialsLoading, setCredentialsLoading] = useState(true);
	const [error, setError] = useState('');
	const [statusMessage, setStatusMessage] = useState('');

	const encryptionReady = useMemo(() => {
		if (!formSchema?.encryption?.keyRef) return false;
		return isDocumentRequestEncryptionReady({
			keyRef: formSchema.encryption.keyRef,
		});
	}, [formSchema]);

	const loadRequests = useCallback(async () => {
		const response = await fetch('/api/users/document-requests');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Unable to load document requests');
		setRequests(Array.isArray(data.requests) ? data.requests : []);
	}, []);

	const loadCredentials = useCallback(async () => {
		const response = await fetch('/api/users/documents');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Unable to load credentials');
		setCredentials(Array.isArray(data.documents) ? data.documents : []);
	}, []);

	const loadRequestDetail = useCallback(async (requestId) => {
		if (!requestId) {
			setRequestDetail(null);
			return;
		}

		setDetailLoading(true);
		try {
			const response = await fetch(
				`/api/users/document-requests/${encodeURIComponent(requestId)}`,
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to load request detail');
			}
			setRequestDetail(data.request || null);
		} catch (loadError) {
			setRequestDetail(null);
			setError(loadError.message);
		} finally {
			setDetailLoading(false);
		}
	}, []);

	const loadIssuers = useCallback(async () => {
		const response = await fetch('/api/users/issuers');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Unable to load issuers');
		setIssuers(Array.isArray(data.issuers) ? data.issuers : []);
	}, []);

	useEffect(() => {
		let mounted = true;

		async function bootstrap() {
			setLoading(true);
			setCredentialsLoading(true);
			setError('');
			try {
				await Promise.all([loadRequests(), loadIssuers(), loadCredentials()]);
			} catch (loadError) {
				if (!mounted) return;
				setError(loadError.message);
			} finally {
				if (mounted) {
					setLoading(false);
					setCredentialsLoading(false);
				}
			}
		}

		bootstrap();
		return () => {
			mounted = false;
		};
	}, [loadCredentials, loadIssuers, loadRequests]);

	useEffect(() => {
		if (!selectedRequestId && requests.length) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSelectedRequestId(requests[0].requestId);
		}
		if (selectedRequestId && !requests.some((item) => item.requestId === selectedRequestId)) {
			setSelectedRequestId(requests[0]?.requestId || '');
		}
	}, [requests, selectedRequestId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadRequestDetail(selectedRequestId);
	}, [loadRequestDetail, selectedRequestId]);

	useEffect(() => {
		let mounted = true;

		async function loadDocumentTypes() {
			if (!selectedIssuerId) {
				setDocumentTypes([]);
				setSelectedDocumentTypeId('');
				return;
			}

			try {
				const response = await fetch(
					`/api/users/issuers/${encodeURIComponent(selectedIssuerId)}/document-types`,
				);
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || 'Unable to load document types');
				}
				if (!mounted) return;
				setDocumentTypes(Array.isArray(data.documentTypes) ? data.documentTypes : []);
				setSelectedDocumentTypeId('');
				setFormSchema(null);
				setFormValues({});
			} catch (loadError) {
				if (!mounted) return;
				setError(loadError.message);
			}
		}

		loadDocumentTypes();
		return () => {
			mounted = false;
		};
	}, [selectedIssuerId]);

	useEffect(() => {
		let mounted = true;

		async function loadFormSchema() {
			if (!selectedIssuerId || !selectedDocumentTypeId) {
				setFormSchema(null);
				setFormValues({});
				return;
			}

			try {
				const response = await fetch(
					`/api/users/issuers/${encodeURIComponent(selectedIssuerId)}/document-types/${encodeURIComponent(selectedDocumentTypeId)}/form-schema`,
				);
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || 'Unable to load request form');
				}
				if (!mounted) return;
				setFormSchema(data);
				setFormValues(emptyFormValues(data.fields || []));
			} catch (loadError) {
				if (!mounted) return;
				setError(loadError.message);
			}
		}

		loadFormSchema();
		return () => {
			mounted = false;
		};
	}, [selectedDocumentTypeId, selectedIssuerId]);

	function updateFormValue(fieldKey, value) {
		setFormValues((current) => ({ ...current, [fieldKey]: value }));
	}

	async function handleSubmitRequest(event) {
		event.preventDefault();
		setSubmitting(true);
		setError('');
		setStatusMessage('');

		try {
			if (!selectedIssuerId || !selectedDocumentTypeId || !formSchema) {
				throw new Error('Select an issuer and document type before submitting.');
			}

			if (!encryptionReady || !formSchema.encryption?.keyRef) {
				throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
			}

			const requestId = crypto.randomUUID();
			const encryptedFields = await encryptDocumentRequestFields({
				issuerId: selectedIssuerId,
				tenantId: formSchema.tenantId,
				ownerUserId: null,
				requestId,
				keyRef: formSchema.encryption.keyRef,
				fields: (formSchema.fields || []).map((field) => ({
					...field,
					value: formValues[field.fieldKey],
				})),
			});

			const response = await fetch('/api/users/document-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					requestId,
					issuerId: selectedIssuerId,
					documentTypeId: selectedDocumentTypeId,
					templateId: formSchema.documentTemplateId || undefined,
					encryptedFields,
				}),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to submit document request');
			}

			await loadRequests();
			setShowRequestForm(false);
			setSelectedIssuerId('');
			setSelectedDocumentTypeId('');
			setFormSchema(null);
			setFormValues({});
			setStatusMessage('Document request submitted.');
		} catch (submitError) {
			setError(submitError.message);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleCancelRequest(requestId) {
		setCancellingId(requestId);
		setError('');
		setStatusMessage('');

		try {
			const response = await fetch(
				`/api/users/document-requests/${encodeURIComponent(requestId)}/cancel`,
				{ method: 'POST' },
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to cancel document request');
			}
			await loadRequests();
			await loadRequestDetail(requestId);
			setStatusMessage('Document request cancelled.');
		} catch (cancelError) {
			setError(cancelError.message);
		} finally {
			setCancellingId('');
		}
	}

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-7 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="document" className="h-6 w-6" />
				</div>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h1 className="text-3xl font-bold text-white">My Documents</h1>
						<p className="mt-4 max-w-2xl text-slate-300">
							View credentials issued to your wallet and request digital copies from
							participating issuers.
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							setShowRequestForm((current) => !current);
							setError('');
							setStatusMessage('');
						}}
						className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600">
						{showRequestForm ? 'Close request form' : 'Request Digital Copy'}
					</button>
				</div>
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
				<h2 className="text-2xl font-bold text-white">My Credentials</h2>
				<p className="mt-2 text-sm text-slate-300">
					Digital copies delivered to your Signatura wallet after issuer approval.
				</p>

				{credentialsLoading ? (
					<p className="mt-5 text-sm text-slate-400">Loading credentials…</p>
				) : credentials.length === 0 ? (
					<div className="mt-5 rounded-xl border border-dashed border-red-500/40 bg-red-500/10 p-8 text-center">
						<p className="text-sm text-slate-300">
							No credentials in your wallet yet. Issuers deliver documents here after
							they mark your request issued with wallet delivery.
						</p>
					</div>
				) : (
					<ul className="mt-5 space-y-3">
						{credentials.map((credential) => (
							<li
								key={credential.documentId}
								className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
								<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
									<div>
										<p className="text-lg font-semibold text-white">
											{credential.documentTypeLabel}
										</p>
										<p className="mt-1 text-sm text-slate-300">
											{credential.issuerName}
										</p>
										<p className="mt-2 text-xs text-slate-400">
											Issued{' '}
											{credential.issuedAt
												? new Date(credential.issuedAt).toLocaleString()
												: '—'}
										</p>
										<p className="mt-2 text-sm text-slate-300">
											Status: {credential.verificationStatus} · Anchor:{' '}
											{credential.anchorStatus}
										</p>
									</div>
									<a
										href={credential.verifyUrl}
										className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-100">
										Verify document
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{showRequestForm ? (
				<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
					<h2 className="text-2xl font-bold text-white">Request a digital copy</h2>
					<p className="mt-2 text-sm text-slate-300">
						Choose an issuer, select a document type, and submit encrypted request
						details.
					</p>

					<form onSubmit={handleSubmitRequest} className="mt-6 grid gap-4">
						<label className="grid gap-2 text-sm font-semibold text-slate-200">
							Issuer
							<select
								value={selectedIssuerId}
								onChange={(event) => setSelectedIssuerId(event.target.value)}
								className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400">
								<option value="">Select issuer</option>
								{issuers.map((issuer) => (
									<option key={issuer.issuerId} value={issuer.issuerId}>
										{issuer.displayName}
									</option>
								))}
							</select>
						</label>

						<label className="grid gap-2 text-sm font-semibold text-slate-200">
							Document type
							<select
								value={selectedDocumentTypeId}
								onChange={(event) => setSelectedDocumentTypeId(event.target.value)}
								disabled={!selectedIssuerId}
								className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400 disabled:opacity-50">
								<option value="">Select document type</option>
								{documentTypes.map((documentType) => (
									<option
										key={documentType.documentTypeId}
										value={documentType.documentTypeId}>
										{documentType.name}
									</option>
								))}
							</select>
						</label>

						{(formSchema?.fields || []).map((field) => (
							<label
								key={field.fieldKey}
								className="grid gap-2 text-sm font-semibold text-slate-200">
								{field.fieldLabel}
								{field.fieldType === 'textarea' ? (
									<textarea
										value={formValues[field.fieldKey] || ''}
										onChange={(event) =>
											updateFormValue(field.fieldKey, event.target.value)
										}
										required={field.required}
										rows={3}
										className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
									/>
								) : (
									<input
										type="text"
										value={formValues[field.fieldKey] || ''}
										onChange={(event) =>
											updateFormValue(field.fieldKey, event.target.value)
										}
										required={field.required}
										className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
									/>
								)}
							</label>
						))}

						{formSchema && !formSchema.encryption?.keyRef ? (
							<p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
								This issuer is not ready for secure document requests yet.
							</p>
						) : null}
						{formSchema?.encryption?.keyRef ? (
							<p className="rounded-lg border border-slate-400/20 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
								Submit will verify this trusted device and encrypt your request at
								submit time. No issuer key import is required.
							</p>
						) : null}

						<div className="flex justify-end gap-3">
							<button
								type="submit"
								disabled={
									submitting ||
									!selectedIssuerId ||
									!selectedDocumentTypeId ||
									!encryptionReady
								}
								className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700">
								{submitting ? 'Submitting...' : 'Submit request'}
							</button>
						</div>
					</form>
				</section>
			) : null}

			<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
				<h2 className="text-2xl font-bold text-white">My Requests</h2>
				<p className="mt-2 text-sm text-slate-300">
					Track pending, approved, denied, issued, and cancelled requests.
				</p>

				{loading ? (
					<p className="mt-5 text-sm text-slate-300">Loading requests...</p>
				) : null}
				{error ? (
					<p className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
						{error}
					</p>
				) : null}
				{statusMessage ? (
					<p className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
						{statusMessage}
					</p>
				) : null}

				{!loading && requests.length === 0 ? (
					<p className="mt-5 text-sm text-slate-400">No document requests yet.</p>
				) : null}

				<div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					<ul className="space-y-3">
						{requests.map((request) => {
							const isSelected = request.requestId === selectedRequestId;
							return (
								<li key={request.requestId}>
									<button
										type="button"
										onClick={() => setSelectedRequestId(request.requestId)}
										className={`w-full rounded-xl border p-4 text-left transition ${
											isSelected
												? 'border-red-400/40 bg-red-500/10'
												: 'border-white/10 bg-slate-950/60 hover:border-white/20'
										}`}>
										<div className="flex flex-wrap items-center gap-2">
											<p className="text-base font-semibold text-white">
												{request.documentTypeLabel || 'Document request'}
											</p>
											<span
												className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[request.status] || STATUS_STYLES.pending}`}>
												{STATUS_LABELS[request.status] || request.status}
											</span>
										</div>
										<p className="mt-1 text-sm text-slate-300">
											{request.issuerDisplayName}
										</p>
										<p className="mt-1 text-xs text-slate-400">
											{request.referenceCode}
										</p>
									</button>
								</li>
							);
						})}
					</ul>

					<div className="rounded-xl border border-white/10 bg-slate-950/60 p-5">
						<h3 className="text-lg font-bold text-white">Request details</h3>
						{!selectedRequestId ? (
							<p className="mt-4 text-sm text-slate-400">
								Select a request to view details.
							</p>
						) : detailLoading ? (
							<p className="mt-4 text-sm text-slate-400">Loading details…</p>
						) : requestDetail ? (
							<div className="mt-4 space-y-4">
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Reference
									</p>
									<p className="text-sm font-semibold text-white">
										{requestDetail.referenceCode}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Issuer
									</p>
									<p className="text-sm text-slate-200">
										{requestDetail.issuerDisplayName}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Document type
									</p>
									<p className="text-sm text-slate-200">
										{requestDetail.documentTypeLabel || '—'}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Status
									</p>
									<p className="mt-1 text-sm text-slate-200">
										{STATUS_LABELS[requestDetail.status] || requestDetail.status}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Submitted
									</p>
									<p className="text-sm text-slate-200">
										{requestDetail.submittedAt
											? new Date(requestDetail.submittedAt).toLocaleString()
											: '—'}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Updated
									</p>
									<p className="text-sm text-slate-200">
										{requestDetail.updatedAt
											? new Date(requestDetail.updatedAt).toLocaleString()
											: '—'}
									</p>
								</div>
								<div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
									<p className="text-sm text-slate-200">
										{requestDetail.statusMessage}
									</p>
									{requestDetail.status === 'denied' &&
									requestDetail.denialReason ? (
										<div className="mt-3 border-t border-white/10 pt-3">
											<p className="text-xs uppercase tracking-wide text-slate-500">
												Denial reason
											</p>
											<p className="mt-1 whitespace-pre-wrap text-sm text-red-100">
												{requestDetail.denialReason}
											</p>
										</div>
									) : null}
								</div>
								{requestDetail.status === 'pending' ? (
									<button
										type="button"
										onClick={() => handleCancelRequest(requestDetail.requestId)}
										disabled={cancellingId === requestDetail.requestId}
										className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-100 disabled:opacity-50">
										{cancellingId === requestDetail.requestId
											? 'Cancelling...'
											: 'Cancel request'}
									</button>
								) : null}
							</div>
						) : (
							<p className="mt-4 text-sm text-slate-400">
								Unable to load request details.
							</p>
						)}
					</div>
				</div>
			</section>
		</div>
	);
}

export { DocumentRequestsPanel };

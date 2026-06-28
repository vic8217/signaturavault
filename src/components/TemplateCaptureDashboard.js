'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const FIELD_TYPES = [
	'text',
	'number',
	'date',
	'dropdown',
	'checkbox',
	'photo',
	'signature',
	'qr',
	'barcode',
	'file',
	'textarea',
	'encrypted_text',
];

const STATUS_STYLES = {
	draft: 'border-amber-200 bg-amber-50 text-amber-800',
	published: 'border-emerald-200 bg-emerald-50 text-emerald-800',
	archived: 'border-slate-200 bg-slate-100 text-slate-700',
};

const TEMPLATE_UPLOAD_MAX_MB = Number(
	process.env.NEXT_PUBLIC_TEMPLATE_UPLOAD_MAX_MB || 50,
);
const TEMPLATE_UPLOAD_MAX_BYTES =
	(Number.isFinite(TEMPLATE_UPLOAD_MAX_MB) && TEMPLATE_UPLOAD_MAX_MB > 0
		? TEMPLATE_UPLOAD_MAX_MB
		: 50) *
	1024 *
	1024;
const FRONT_PROXY_SAFE_IMAGE_BYTES = 900 * 1024;

function emptyField(index = 1) {
	return {
		id: `temp-${Date.now()}-${index}`,
		field_label: 'New field',
		field_key: `new_field_${index}`,
		field_type: 'text',
		required: false,
		encrypted: false,
		public_visible: false,
		searchable: false,
		validation_rule: '',
		default_value: '',
		options_json: null,
		x_position: 10,
		y_position: 10 + index * 3,
		width: 24,
		height: 7,
		page_number: 1,
		sort_order: index,
	};
}

function normalizeKey(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function loadImageFromFile(file) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new window.Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Unable to prepare image for upload'));
		};
		image.src = url;
	});
}

async function optimizeImageSampleForUpload(file) {
	if (!file?.type?.startsWith('image/') || file.size <= FRONT_PROXY_SAFE_IMAGE_BYTES) {
		return { file, optimized: false };
	}
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return { file, optimized: false };
	}

	const image = await loadImageFromFile(file);
	const maxDimension = 1600;
	const scale = Math.min(
		1,
		maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height),
	);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
	canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
	const context = canvas.getContext('2d');
	if (!context) return { file, optimized: false };
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	const blob = await new Promise((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', 0.82),
	);
	if (!blob || blob.size >= file.size) return { file, optimized: false };

	const optimizedName = `${String(file.name || 'template-sample').replace(/\.[^.]+$/, '')}-optimized.jpg`;
	return {
		file: new File([blob], optimizedName, { type: 'image/jpeg' }),
		optimized: true,
		originalSize: file.size,
		optimizedSize: blob.size,
	};
}

function TemplateCaptureDashboard({
	apiBase = '/api/issuer/templates',
	listPath = apiBase,
	title = 'Issuer document templates',
	kicker = 'Template capture',
	description = 'Upload an ID, certificate, permit, diploma, license, prescription, or application form. OCR suggestions always stay in draft until an authorized issuer reviews and publishes them.',
	showUpload = true,
	canPublish = true,
	canArchive = true,
	assistanceMode = false,
} = {}) {
	const [templates, setTemplates] = useState([]);
	const [selectedId, setSelectedId] = useState('');
	const [selected, setSelected] = useState(null);
	const [fields, setFields] = useState([]);
	const [activeFieldId, setActiveFieldId] = useState('');
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const [isBusy, setIsBusy] = useState(false);
	const [upload, setUpload] = useState({
		name: '',
		document_type: '',
		file: null,
		sample_policy: 'placeholder',
		auto_redact_before_ocr: true,
	});
	const previewRef = useRef(null);
	const dragRef = useRef(null);

	const activeField = useMemo(
		() => fields.find((field) => field.id === activeFieldId) || fields[0],
		[activeFieldId, fields],
	);

	const api = useCallback(async (path, options = {}) => {
		const response = await fetch(path, options);
		const text = await response.text();
		let data = {};
		try {
			data = text ? JSON.parse(text) : {};
		} catch {
			data = {};
		}
		if (!response.ok) {
			if (response.status === 413) {
				throw new Error(
					'Upload was rejected before Signatura could process it. A front proxy or hosting layer is likely limiting request bodies; set nginx client_max_body_size or the equivalent upload limit above the template upload size.',
				);
			}
			throw new Error(data.error || `Request failed (${response.status})`);
		}
		return data;
	}, []);

	const loadTemplates = useCallback(async () => {
		setError('');
		try {
			const data = await api(listPath);
			setTemplates(data.templates || []);
			setSelectedId((current) => current || data.templates?.[0]?.id || '');
		} catch (loadError) {
			setError(loadError.message);
		}
	}, [api, listPath]);

	const loadTemplate = useCallback(async (id) => {
		setError('');
		try {
			const data = await api(`${apiBase}/${id}`);
			setSelected(data.template);
			setFields(data.template.fields || []);
			setActiveFieldId(data.template.fields?.[0]?.id || '');
		} catch (loadError) {
			setError(loadError.message);
		}
	}, [api, apiBase]);

	useEffect(() => {
		const timer = setTimeout(loadTemplates, 0);
		return () => clearTimeout(timer);
	}, [loadTemplates]);

	useEffect(() => {
		if (!selectedId) return undefined;
		const timer = setTimeout(() => loadTemplate(selectedId), 0);
		return () => clearTimeout(timer);
	}, [loadTemplate, selectedId]);

	async function uploadTemplate(event) {
		event.preventDefault();
		if (!upload.file) return;
		if (upload.file.size > TEMPLATE_UPLOAD_MAX_BYTES) {
			setError(
				`Template sample is too large. Upload a JPG, PNG, or PDF up to ${
					Math.floor(TEMPLATE_UPLOAD_MAX_BYTES / 1024 / 1024)
				} MB.`,
			);
			setMessage('');
			return;
		}
		setIsBusy(true);
		setError('');
		setMessage('Uploading template sample...');
		try {
			const prepared = await optimizeImageSampleForUpload(upload.file);
			const body = new FormData();
			body.set('file', prepared.file);
			body.set('name', upload.name);
			body.set('document_type', upload.document_type);
			body.set('sample_policy', upload.sample_policy);
			body.set(
				'auto_redact_before_ocr',
				upload.auto_redact_before_ocr ? 'true' : 'false',
			);
			const data = await api(`${apiBase}/upload`, {
				method: 'POST',
				body,
			});
			setUpload({
				name: '',
				document_type: '',
				file: null,
				sample_policy: 'placeholder',
				auto_redact_before_ocr: true,
			});
			setSelectedId(data.template.id);
			await loadTemplates();
			setMessage(
				prepared.optimized
					? `Template uploaded as draft. Image was optimized from ${Math.ceil(
							prepared.originalSize / 1024,
						)} KB to ${Math.ceil(
							prepared.optimizedSize / 1024,
						)} KB before upload. Run OCR to suggest fields.`
					: 'Template uploaded as draft. Run OCR to suggest fields.',
			);
		} catch (uploadError) {
			setError(uploadError.message);
			setMessage('');
		} finally {
			setIsBusy(false);
		}
	}

	async function extractTemplate(id = selected?.id) {
		if (!id) return;
		setIsBusy(true);
		setError('');
		setMessage('Running OCR and layout detection...');
		try {
			const data = await api(`${apiBase}/${id}/extract`, {
				method: 'POST',
			});
			setSelected(data.template);
			setFields(data.template.fields || []);
			setActiveFieldId(data.template.fields?.[0]?.id || '');
			await loadTemplates();
			setMessage('Detected fields are ready for human review.');
		} catch (extractError) {
			setError(extractError.message);
			setMessage('');
		} finally {
			setIsBusy(false);
		}
	}

	async function saveDraft() {
		if (!selected) return;
		setIsBusy(true);
		setError('');
		setMessage('Saving draft template...');
		try {
			const data = await api(`${apiBase}/${selected.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: selected.name,
					document_type: selected.document_type,
					fields,
				}),
			});
			setSelected(data.template);
			setFields(data.template.fields || []);
			setSelectedId(data.template.id);
			await loadTemplates();
			setMessage('Draft saved with audit history.');
		} catch (saveError) {
			setError(saveError.message);
			setMessage('');
		} finally {
			setIsBusy(false);
		}
	}

	async function publishTemplate(id = selected?.id) {
		if (!id) return;
		setIsBusy(true);
		setError('');
		setMessage('Publishing reviewed template...');
		try {
			const data = await api(`${apiBase}/${id}/publish`, {
				method: 'POST',
			});
			setSelected(data.template);
			await loadTemplates();
			setMessage('Template published for issuance and digital forms.');
		} catch (publishError) {
			setError(publishError.message);
			setMessage('');
		} finally {
			setIsBusy(false);
		}
	}

	async function archiveTemplate(id) {
		setIsBusy(true);
		setError('');
		try {
			await api(`${apiBase}/${id}/archive`, { method: 'POST' });
			await loadTemplates();
			if (selectedId === id) await loadTemplate(id);
			setMessage('Template archived.');
		} catch (archiveError) {
			setError(archiveError.message);
		} finally {
			setIsBusy(false);
		}
	}

	function updateField(id, patch) {
		setFields((current) =>
			current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
		);
	}

	function addField() {
		const field = emptyField(fields.length + 1);
		setFields((current) => [...current, field]);
		setActiveFieldId(field.id);
	}

	function removeField(id) {
		setFields((current) => current.filter((field) => field.id !== id));
		if (activeFieldId === id) setActiveFieldId('');
	}

	function startDrag(event, field) {
		if (!previewRef.current || selected?.status !== 'draft') return;
		event.preventDefault();
		const rect = previewRef.current.getBoundingClientRect();
		dragRef.current = {
			fieldId: field.id,
			rect,
		};
		setActiveFieldId(field.id);
		window.addEventListener('mousemove', dragField);
		window.addEventListener('mouseup', stopDrag);
	}

	function dragField(event) {
		const drag = dragRef.current;
		if (!drag) return;
		const x = ((event.clientX - drag.rect.left) / drag.rect.width) * 100;
		const y = ((event.clientY - drag.rect.top) / drag.rect.height) * 100;
		updateField(drag.fieldId, {
			x_position: Math.max(0, Math.min(95, Number(x.toFixed(2)))),
			y_position: Math.max(0, Math.min(95, Number(y.toFixed(2)))),
		});
	}

	function stopDrag() {
		dragRef.current = null;
		window.removeEventListener('mousemove', dragField);
		window.removeEventListener('mouseup', stopDrag);
	}

	return (
		<div className="space-y-8 text-slate-900">
			<section className="border-b border-slate-200 pb-6">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-500">
							{kicker}
						</p>
						<h1 className="mt-2 text-3xl font-bold">{title}</h1>
						<p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
							{description}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
						On-chain policy: hashes, timestamps, and issuer signature proofs only.
					</div>
				</div>
			</section>

			<DigitizationGuide assistanceMode={assistanceMode} />

			{showUpload ? (
				<form
					onSubmit={uploadTemplate}
					className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
						<p className="font-bold">Step 1 - Upload sample template</p>
						<p className="mt-1 leading-6">
							Preferred: upload a blank or sanitized sample with placeholders like
							[STUDENT NAME], [EMPLOYEE ID], or [DATE OF BIRTH]. The goal is to
							capture structure, layout, and field positions, not recipient
							information.
						</p>
					</div>
					<div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
					<label className="grid gap-2 text-sm font-semibold">
						<span>Template name</span>
						<input
							value={upload.name}
							onChange={(event) => setUpload({ ...upload, name: event.target.value })}
							placeholder="Professional Organization ID"
							className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-400"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Document type</span>
						<input
							value={upload.document_type}
							onChange={(event) =>
								setUpload({ ...upload, document_type: event.target.value })
							}
							placeholder="Professional ID, Diploma, Permit"
							className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-400"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Sample file</span>
						<input
							type="file"
							accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
							onChange={(event) =>
								setUpload({ ...upload, file: event.target.files?.[0] || null })
							}
							className="rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1"
						/>
						<span className="text-xs font-normal text-slate-500">
							JPG, PNG, or PDF up to {Math.floor(TEMPLATE_UPLOAD_MAX_BYTES / 1024 / 1024)} MB.
						</span>
					</label>
					<button
						disabled={isBusy || !upload.file}
						className="self-end rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:bg-slate-300">
						Upload document
					</button>
					</div>
					<div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
						<p className="font-bold text-slate-900">Sample data safety</p>
						<label className="flex items-start gap-3">
							<input
								type="radio"
								name="sample_policy"
								value="placeholder"
								checked={upload.sample_policy === 'placeholder'}
								onChange={() =>
									setUpload({
										...upload,
										sample_policy: 'placeholder',
										auto_redact_before_ocr: true,
									})
								}
								className="mt-1"
							/>
							<span>
								<span className="font-semibold">Blank or sanitized sample</span>
								<span className="block text-slate-600">
									Uses placeholders instead of real personal data.
								</span>
							</span>
						</label>
						<label className="flex items-start gap-3">
							<input
								type="radio"
								name="sample_policy"
								value="contains_real_data"
								checked={upload.sample_policy === 'contains_real_data'}
								onChange={() =>
									setUpload({
										...upload,
										sample_policy: 'contains_real_data',
										auto_redact_before_ocr: true,
									})
								}
								className="mt-1"
							/>
							<span>
								<span className="font-semibold">Sample contains real data</span>
								<span className="block text-slate-600">
									Allowed only with redaction before OCR storage and review.
								</span>
							</span>
						</label>
						{upload.sample_policy === 'contains_real_data' ? (
							<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
								<p className="font-bold">Real data warning</p>
								<p className="mt-1 leading-6">
									Signatura will use the file only to detect layout and field
									positions. Automatic redaction must be enabled before OCR can
									process this sample.
								</p>
								<label className="mt-3 flex items-center gap-2 font-semibold">
									<input
										type="checkbox"
										checked={upload.auto_redact_before_ocr}
										onChange={(event) =>
											setUpload({
												...upload,
												auto_redact_before_ocr: event.target.checked,
											})
										}
									/>
									<span>Apply automatic redaction before OCR processing</span>
								</label>
							</div>
						) : null}
					</div>
				</form>
			) : null}

			{message ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
			{error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

			<section className="grid gap-6 xl:grid-cols-[0.85fr_1.6fr]">
				<TemplateList
					templates={templates}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onExtract={extractTemplate}
					onPublish={publishTemplate}
					onArchive={archiveTemplate}
					disabled={isBusy}
					canPublish={canPublish}
					canArchive={canArchive}
				/>

				{selected ? (
					<div className="space-y-6">
						<ReviewWorkspace
							template={selected}
							setTemplate={setSelected}
							fields={fields}
							activeField={activeField}
							setActiveFieldId={setActiveFieldId}
							updateField={updateField}
							addField={addField}
							removeField={removeField}
							saveDraft={saveDraft}
							publishTemplate={publishTemplate}
							isBusy={isBusy}
							previewRef={previewRef}
							startDrag={startDrag}
							canPublish={canPublish}
						/>
						<DigitalFormGenerator template={selected} fields={fields} />
					</div>
				) : (
					<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
						Upload or select a template to review detected fields.
					</div>
				)}
			</section>
		</div>
	);
}

function DigitizationGuide({ assistanceMode }) {
	const steps = assistanceMode
		? [
				'Open a draft template submitted by an issuer.',
				'Run OCR when field suggestions are missing or stale.',
				'Adjust field labels, keys, type, validation, and box positions.',
				'Save the draft and leave final review/publishing to the issuer.',
			]
		: [
				'Upload a blank or sanitized sample with placeholders instead of real personal data.',
				'Run OCR to create draft field suggestions.',
				'Review every field label, field key, type, validation, and placement.',
				'Publish only after an authorized issuer confirms the digital form.',
			];

	return (
		<section className="rounded-lg border border-slate-200 bg-white p-5">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">
						Reference guide
					</p>
					<h2 className="mt-2 text-xl font-bold">Digitization responsibility</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
						Templates turn a sample document into reusable digital forms. Only
						field structure, layout positions, and template metadata should be
						captured. Prefer placeholders such as [STUDENT NAME], [EMPLOYEE ID],
						or [DATE OF BIRTH]. Do not place document contents, QR tokens,
						verification tokens, or private personal data on-chain.
					</p>
				</div>
				<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					{assistanceMode
						? 'Developer tech staff may assist drafts, but issuer staff must approve final publication.'
						: 'Issuer staff is responsible for final review before publishing.'}
				</div>
			</div>
			<ol className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
				{steps.map((step, index) => (
					<li key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<span className="text-xs font-bold uppercase tracking-[0.16em] text-red-500">
							Step {index + 1}
						</span>
						<p className="mt-2 leading-6">{step}</p>
					</li>
				))}
			</ol>
		</section>
	);
}

function TemplateList({ templates, selectedId, onSelect, onExtract, onPublish, onArchive, disabled, canPublish, canArchive }) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white">
			<div className="border-b border-slate-200 p-4">
				<h2 className="text-lg font-bold">Templates</h2>
				<p className="mt-1 text-xs text-slate-500">Drafts require review before publishing.</p>
			</div>
			<div className="divide-y divide-slate-100">
				{templates.map((template) => (
					<div
						key={template.id}
						className={`p-4 ${selectedId === template.id ? 'bg-red-50/50' : ''}`}>
						<div className="flex items-start justify-between gap-3">
							<button
								onClick={() => onSelect(template.id)}
								className="min-w-0 text-left">
								<p className="truncate text-sm font-bold">{template.name}</p>
								<p className="mt-1 text-xs text-slate-500">
									{template.document_type || 'Unclassified'} · v{template.version}
								</p>
								{template.issuer_name ? (
									<p className="mt-1 text-xs text-slate-500">
										{template.issuer_name}
									</p>
								) : null}
								<p className="mt-1 text-xs text-slate-500">
									{template.sample_policy === 'contains_real_data'
										? `Real-data sample${
												template.redaction_applied_before_ocr
													? ' · OCR text redacted'
													: ' · redaction required'
											}`
										: 'Placeholder/sanitized sample'}
								</p>
							</button>
							<span
								className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold uppercase ${
									STATUS_STYLES[template.status] || STATUS_STYLES.draft
								}`}>
								{template.status}
							</span>
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							<button
								onClick={() => onSelect(template.id)}
								className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
								Review/Edit
							</button>
							<button
								onClick={() => onExtract(template.id)}
								disabled={disabled || template.status !== 'draft'}
								className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
								Run OCR
							</button>
							<button
								onClick={() => onPublish(template.id)}
								disabled={disabled || template.status !== 'draft'}
								className={`rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
									canPublish ? '' : 'hidden'
								}`}>
								Publish
							</button>
							<button
								onClick={() => onArchive(template.id)}
								disabled={disabled || template.status === 'archived'}
								className={`rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
									canArchive ? '' : 'hidden'
								}`}>
								Archive
							</button>
						</div>
					</div>
				))}
				{templates.length === 0 ? (
					<p className="p-4 text-sm text-slate-500">No templates yet.</p>
				) : null}
			</div>
		</div>
	);
}

function ReviewWorkspace({
	template,
	setTemplate,
	fields,
	activeField,
	setActiveFieldId,
	updateField,
	addField,
	removeField,
	saveDraft,
	publishTemplate,
	isBusy,
	previewRef,
	startDrag,
	canPublish,
}) {
	const canEdit = template.status === 'draft';
	const isPdf = template.preview_image_url?.toLowerCase().includes('.pdf') || template.schema?.mimeType === 'application/pdf';

	return (
		<div className="rounded-lg border border-slate-200 bg-white">
			<div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
						<span>Name</span>
						<input
							disabled={!canEdit}
							value={template.name}
							onChange={(event) => setTemplate({ ...template, name: event.target.value })}
							className="rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal text-slate-900 disabled:bg-slate-50"
						/>
					</label>
					<label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
						<span>Document type</span>
						<input
							disabled={!canEdit}
							value={template.document_type || ''}
							onChange={(event) =>
								setTemplate({ ...template, document_type: event.target.value })
							}
							className="rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal text-slate-900 disabled:bg-slate-50"
						/>
					</label>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						onClick={addField}
						disabled={!canEdit}
						className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-40">
						Add field
					</button>
					<button
						onClick={saveDraft}
						disabled={isBusy || !canEdit}
						className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-40">
						Save Draft
					</button>
					<button
						onClick={() => publishTemplate(template.id)}
						disabled={isBusy || !canEdit || fields.length === 0}
						className={`rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300 ${
							canPublish ? '' : 'hidden'
						}`}>
						Publish Template
					</button>
				</div>
			</div>

			<div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
					<div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4">
						{isPdf ? (
							<object
								ref={previewRef}
								data={template.preview_image_url}
								type="application/pdf"
								className="h-[640px] w-full rounded bg-white">
								<div className="p-4 text-sm text-slate-600">PDF preview unavailable.</div>
							</object>
						) : (
							<div ref={previewRef} className="relative mx-auto w-fit max-w-full">
								<Image
									src={template.preview_image_url}
									alt={`${template.name} preview`}
									width={900}
									height={760}
									unoptimized
									className="block max-h-[760px] max-w-full rounded bg-white object-contain"
								/>
								<FieldBoxes
									fields={fields}
									activeField={activeField}
									setActiveFieldId={setActiveFieldId}
									startDrag={startDrag}
								/>
							</div>
						)}
					</div>
				</div>

				<div className="max-h-[760px] overflow-auto p-4">
					<div className="mb-3 flex items-center justify-between">
						<h3 className="text-base font-bold">Detected fields</h3>
						<span className="text-xs text-slate-500">{fields.length} fields</span>
					</div>
					<div className="space-y-3">
						{fields.map((field) => (
							<FieldCard
								key={field.id}
								field={field}
								isActive={activeField?.id === field.id}
								canEdit={canEdit}
								onFocus={() => setActiveFieldId(field.id)}
								onChange={(patch) => updateField(field.id, patch)}
								onRemove={() => removeField(field.id)}
							/>
						))}
						{fields.length === 0 ? (
							<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
								Run OCR or add fields manually.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function FieldBoxes({ fields, activeField, setActiveFieldId, startDrag }) {
	return fields.map((field) => (
		<button
			key={field.id}
			onMouseDown={(event) => startDrag(event, field)}
			onClick={() => setActiveFieldId(field.id)}
			style={{
				left: `${field.x_position}%`,
				top: `${field.y_position}%`,
				width: `${field.width}%`,
				height: `${field.height}%`,
			}}
			className={`absolute border-2 bg-red-500/10 text-left text-[10px] font-bold text-red-950 ${
				activeField?.id === field.id ? 'border-red-500' : 'border-red-300'
			}`}>
			<span className="absolute -top-5 left-0 rounded bg-white px-1 shadow">
				{field.field_label}
			</span>
		</button>
	));
}

function FieldCard({ field, isActive, canEdit, onFocus, onChange, onRemove }) {
	return (
		<div
			onClick={onFocus}
			className={`rounded-lg border p-3 ${
				isActive ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
			}`}>
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="grid gap-1 text-xs font-semibold">
					<span>Field label</span>
					<input
						disabled={!canEdit}
						value={field.field_label}
						onChange={(event) =>
							onChange({
								field_label: event.target.value,
								field_key: normalizeKey(event.target.value),
							})
						}
						className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
					/>
				</label>
				<label className="grid gap-1 text-xs font-semibold">
					<span>Field key</span>
					<input
						disabled={!canEdit}
						value={field.field_key}
						onChange={(event) => onChange({ field_key: normalizeKey(event.target.value) })}
						className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
					/>
				</label>
				<label className="grid gap-1 text-xs font-semibold">
					<span>Type</span>
					<select
						disabled={!canEdit}
						value={field.field_type}
						onChange={(event) =>
							onChange({
								field_type: event.target.value,
								encrypted: event.target.value === 'encrypted_text' || field.encrypted,
							})
						}
						className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50">
						{FIELD_TYPES.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-xs font-semibold">
					<span>Validation</span>
					<input
						disabled={!canEdit}
						value={field.validation_rule || ''}
						onChange={(event) => onChange({ validation_rule: event.target.value })}
						placeholder="email, date, regex:..."
						className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
					/>
				</label>
			</div>
			<div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
				<Toggle label="Required" checked={field.required} disabled={!canEdit} onChange={(value) => onChange({ required: value })} />
				<Toggle label="Encrypted" checked={field.encrypted} disabled={!canEdit} onChange={(value) => onChange({ encrypted: value })} />
				<Toggle label="Public verify" checked={field.public_visible} disabled={!canEdit} onChange={(value) => onChange({ public_visible: value })} />
				<Toggle label="Searchable" checked={field.searchable} disabled={!canEdit} onChange={(value) => onChange({ searchable: value })} />
			</div>
			<div className="mt-3 grid grid-cols-4 gap-2 text-xs">
				{[
					['x_position', 'X'],
					['y_position', 'Y'],
					['width', 'W'],
					['height', 'H'],
				].map(([key, label]) => (
					<label key={key} className="grid gap-1 font-semibold">
						<span>{label}</span>
						<input
							disabled={!canEdit}
							type="number"
							min="0"
							max="100"
							value={field[key]}
							onChange={(event) => onChange({ [key]: Number(event.target.value) })}
							className="rounded border border-slate-300 px-2 py-1.5 disabled:bg-slate-50"
						/>
					</label>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<button
					onClick={onRemove}
					disabled={!canEdit}
					className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40">
					Delete
				</button>
			</div>
		</div>
	);
}

function Toggle({ label, checked, disabled, onChange }) {
	return (
		<label className="flex items-center gap-2 font-semibold">
			<input
				type="checkbox"
				disabled={disabled}
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>{label}</span>
		</label>
	);
}

function DigitalFormGenerator({ template, fields }) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white p-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-bold">Digital form generator</h2>
					<p className="mt-1 text-xs text-slate-500">
						Generated from the reviewed template schema for issuance workflows.
					</p>
				</div>
				<span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold uppercase text-slate-500">
					{template.status}
				</span>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				{fields.map((field) => (
					<label key={field.id} className="grid gap-1 text-sm font-semibold">
						<span>
							{field.field_label}
							{field.required ? <span className="text-red-500"> *</span> : null}
						</span>
						<FormInput field={field} />
					</label>
				))}
			</div>
		</div>
	);
}

function FormInput({ field }) {
	const common = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
	if (field.field_type === 'textarea') return <textarea className={common} rows={3} />;
	if (field.field_type === 'checkbox') return <input type="checkbox" className="h-5 w-5" />;
	if (field.field_type === 'dropdown') {
		const options = Array.isArray(field.options_json) ? field.options_json : ['Option 1', 'Option 2'];
		return (
			<select className={common}>
				{options.map((option) => (
					<option key={option}>{option}</option>
				))}
			</select>
		);
	}
	if (['file', 'photo', 'signature'].includes(field.field_type)) {
		return <input type="file" className={common} />;
	}
	return (
		<input
			type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'}
			className={common}
		/>
	);
}

export { TemplateCaptureDashboard };

'use client';

import { useEffect, useMemo, useState } from 'react';

function IssuerTemplateIssuancePanel() {
	const [templates, setTemplates] = useState([]);
	const [selectedId, setSelectedId] = useState('');
	const [error, setError] = useState('');

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

	return (
		<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-xl font-bold text-white">
						Issue from published template
					</h2>
					<p className="mt-2 text-sm leading-6 text-slate-300">
						Published templates expose their reviewed schema as digital forms.
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
				<div className="mt-5 grid gap-3 sm:grid-cols-2">
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
								className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-400"
							/>
						</label>
					))}
				</div>
			) : null}
		</section>
	);
}

export { IssuerTemplateIssuancePanel };

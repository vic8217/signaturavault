const FIELD_DICTIONARY = [
	[/given\s*name|first\s*name/i, 'given_name', 'text', true, true],
	[/middle\s*name/i, 'middle_name', 'text', true, true],
	[/surname|last\s*name|family\s*name/i, 'surname', 'text', true, true],
	[/full\s*name|name of/i, 'full_name', 'text', true, true],
	[/address/i, 'address', 'textarea', false, true],
	[/birth\s*date|birthdate|date of birth/i, 'birthdate', 'date', false, true],
	[/member\s*id|membership\s*(id|no|number)/i, 'member_id', 'text', true, false],
	[/permit\s*(no|number)/i, 'permit_number', 'text', true, false],
	[/license\s*(no|number)/i, 'license_number', 'text', true, false],
	[/prc\s*(no|number)?/i, 'prc_number', 'text', true, false],
	[/issue\s*date|date\s*issued|issued/i, 'issue_date', 'date', true, false],
	[/expiry|expiration|valid\s*until|expires/i, 'expiry_date', 'date', true, false],
	[/signature|signed/i, 'signature', 'signature', true, true],
	[/seal/i, 'seal', 'photo', false, true],
	[/qr|scan/i, 'qr_code', 'qr', false, false],
	[/photo|picture|portrait/i, 'photo', 'photo', true, true],
	[/email/i, 'email', 'text', false, true, 'email'],
	[/mobile|phone|contact/i, 'contact_number', 'text', false, true, 'phone'],
	[/status/i, 'status', 'dropdown', false, false],
	[/document\s*(no|number)/i, 'document_number', 'text', true, false],
	[/certificate\s*(no|number)/i, 'certificate_number', 'text', true, false],
	[/applicant/i, 'applicant_name', 'text', true, true],
	[/consent|agree/i, 'consent_checkbox', 'checkbox', true, false],
];

const FIELD_LABELS = [
	{
		pattern: /given\s*name|first\s*name/i,
		label: 'Given Name',
		key: 'given_name',
		type: 'text',
		encrypted: true,
		publicVisible: true,
	},
	{
		pattern: /middle\s*name/i,
		label: 'Middle Name',
		key: 'middle_name',
		type: 'text',
		encrypted: true,
		publicVisible: true,
	},
	{
		pattern: /surname|last\s*name|family\s*name/i,
		label: 'Surname',
		key: 'surname',
		type: 'text',
		encrypted: true,
		publicVisible: true,
	},
	{
		pattern: /full\s*name|name of|cardholder/i,
		label: 'Full Name',
		key: 'full_name',
		type: 'text',
		encrypted: true,
		publicVisible: true,
	},
	{
		pattern: /birth\s*date|birthdate|date of birth/i,
		label: 'Birthdate',
		key: 'birthdate',
		type: 'date',
		encrypted: true,
		publicVisible: true,
		validationRule: 'date',
	},
	{
		pattern: /address/i,
		label: 'Address',
		key: 'address',
		type: 'textarea',
		encrypted: true,
		publicVisible: false,
	},
	{
		pattern: /(member|card|document|id|sss)\s*(id|no|number|#)|crn/i,
		label: 'ID Number',
		key: 'member_id',
		type: 'text',
		encrypted: false,
		publicVisible: true,
		searchable: true,
	},
];

const NOISE_PATTERNS = [
	/^(eng|card|system|security|social|mysss)$/i,
	/^[^\w]+$/,
	/^[a-z]{1}$/i,
];

function slugify(label) {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function matchDictionary(label) {
	for (const [pattern, key, type, publicVisible, encrypted, validationRule] of FIELD_DICTIONARY) {
		if (pattern.test(label)) {
			return { key, type, publicVisible, encrypted, validationRule: validationRule || '' };
		}
	}

	const normalized = label.toLowerCase();
	if (normalized.includes('date')) {
		return { key: slugify(label), type: 'date', publicVisible: true, encrypted: false, validationRule: 'date' };
	}
	if (normalized.includes('number') || normalized.includes('no.')) {
		return { key: slugify(label), type: 'text', publicVisible: true, encrypted: false, validationRule: '' };
	}
	return { key: slugify(label), type: 'text', publicVisible: false, encrypted: false, validationRule: '' };
}

function fieldFromRegion(region, index, override = {}) {
	const label = override.label || region.label || region.text || 'Detected field';
	const match = matchDictionary(label);
	const relative = region.relative_box || {};
	return {
		label,
		suggested_key: override.key || match.key,
		field_type: override.type || match.type,
		confidence: Number(region.confidence || override.confidence || 0.75),
		required: override.required ?? true,
		encrypted: override.encrypted ?? match.encrypted,
		public_visible: override.publicVisible ?? match.publicVisible,
		searchable: ['member_id', 'permit_number', 'license_number', 'document_number'].includes(
			override.key || match.key,
		),
		validation_rule: override.validationRule ?? match.validationRule,
		bounding_box: region.bounding_box || null,
		relative_box: {
			x: Number(relative.x ?? 8),
			y: Number(relative.y ?? 8 + index * 8),
			width: Number(Math.max(8, relative.width || 26)),
			height: Number(Math.max(4, relative.height || 6)),
			page: Number(relative.page || 1),
		},
		sort_order: index + 1,
	};
}

function normalizeText(value) {
	return String(value || '').replace(/\s+/g, ' ').trim();
}

function blockRight(block) {
	return block.relative_box.x + block.relative_box.width;
}

function blockBottom(block) {
	return block.relative_box.y + block.relative_box.height;
}

function boxRight(box) {
	return box.x + box.width;
}

function boxBottom(box) {
	return box.y + box.height;
}

function mergeBlocks(blocks, fallbackLabel) {
	const sorted = [...blocks].sort((a, b) => a.relative_box.x - b.relative_box.x);
	const relativeBoxes = sorted.map((block) => block.relative_box);
	const x = Math.min(...relativeBoxes.map((box) => box.x));
	const y = Math.min(...relativeBoxes.map((box) => box.y));
	const right = Math.max(...relativeBoxes.map((box) => box.x + box.width));
	const bottom = Math.max(...relativeBoxes.map((box) => box.y + box.height));

	return {
		text: normalizeText(sorted.map((block) => block.text).join(' ')) || fallbackLabel,
		confidence:
			sorted.reduce((sum, block) => sum + Number(block.confidence || 0.75), 0) /
			Math.max(1, sorted.length),
		relative_box: {
			x,
			y,
			width: Math.max(8, right - x),
			height: Math.max(4, bottom - y),
			page: sorted[0]?.relative_box?.page || 1,
		},
	};
}

function groupBlocksIntoRows(blocks) {
	const rows = [];
	const sorted = [...blocks].sort((a, b) => {
		if (a.relative_box.page !== b.relative_box.page) {
			return a.relative_box.page - b.relative_box.page;
		}
		return a.relative_box.y - b.relative_box.y || a.relative_box.x - b.relative_box.x;
	});

	for (const block of sorted) {
		const row = rows.find(
			(candidate) =>
				candidate.page === block.relative_box.page &&
				Math.abs(candidate.y - block.relative_box.y) <= 2.5,
		);
		if (row) {
			row.blocks.push(block);
			row.y =
				row.blocks.reduce((sum, item) => sum + item.relative_box.y, 0) / row.blocks.length;
		} else {
			rows.push({ page: block.relative_box.page, y: block.relative_box.y, blocks: [block] });
		}
	}

	return rows.map((row) => ({
		...row,
		blocks: row.blocks.sort((a, b) => a.relative_box.x - b.relative_box.x),
	}));
}

function findLabelInRow(row, definition) {
	for (let start = 0; start < row.blocks.length; start += 1) {
		for (let size = 1; size <= 3 && start + size <= row.blocks.length; size += 1) {
			const blocks = row.blocks.slice(start, start + size);
			const text = normalizeText(blocks.map((block) => block.text).join(' '));
			if (definition.pattern.test(text)) {
				return { blocks, region: mergeBlocks(blocks, definition.label) };
			}
		}
	}
	return null;
}

function likelyValueBlock(block) {
	const text = normalizeText(block.text);
	return (
		text.length >= 2 &&
		!NOISE_PATTERNS.some((pattern) => pattern.test(text)) &&
		Number(block.confidence || 0) >= 0.25
	);
}

function findValueNearLabel(rows, labelRow, labelMatch) {
	const labelBox = labelMatch.region.relative_box;
	const sameRowValues = labelRow.blocks.filter(
		(block) =>
			block.relative_box.x > boxRight(labelBox) + 2 &&
			block.relative_box.x <= labelBox.x + 35 &&
			likelyValueBlock(block),
	);
	if (sameRowValues.length > 0) return mergeBlocks(sameRowValues, labelMatch.region.text);

	const nextRows = rows.filter(
		(row) =>
			row.page === labelRow.page &&
			row.y > labelBox.y &&
			row.y - boxBottom(labelBox) <= 8,
	);
	for (const row of nextRows) {
		const values = row.blocks.filter(
			(block) =>
				likelyValueBlock(block) &&
				block.relative_box.x >= Math.max(0, labelBox.x - 2) &&
				block.relative_box.x <= Math.min(96, labelBox.x + 35),
		);
		if (values.length > 0) return mergeBlocks(values, labelMatch.region.text);
	}

	return labelMatch.region;
}

function createLabeledFieldSuggestions(blocks) {
	const rows = groupBlocksIntoRows(blocks);
	const suggestions = [];

	for (const definition of FIELD_LABELS) {
		for (const row of rows) {
			const labelMatch = findLabelInRow(row, definition);
			if (!labelMatch) continue;
			const valueRegion = findValueNearLabel(rows, row, labelMatch);
			suggestions.push(
				fieldFromRegion(valueRegion, suggestions.length, {
					label: definition.label,
					key: definition.key,
					type: definition.type,
					encrypted: definition.encrypted,
					publicVisible: definition.publicVisible,
					searchable: definition.searchable,
					validationRule: definition.validationRule || '',
				}),
			);
			break;
		}
	}

	return suggestions;
}

function createFieldSuggestions(layout) {
	const labels = layout.labels || [];
	const textFields = createLabeledFieldSuggestions(labels);

	const offset = textFields.length;
	const photoFields = (layout.photo_areas || []).map((region, index) =>
		fieldFromRegion(region, offset + index, {
			label: region.label || 'Photo',
			key: 'photo',
			type: 'photo',
			encrypted: true,
			publicVisible: false,
		}),
	);
	const signatureFields = (layout.signature_areas || []).map((region, index) =>
		fieldFromRegion(region, offset + photoFields.length + index, {
			label: region.label || 'Signature',
			key: 'signature',
			type: 'signature',
			encrypted: true,
			publicVisible: false,
		}),
	);
	const qrFields = (layout.qr_areas || []).map((region, index) =>
		fieldFromRegion(region, offset + photoFields.length + signatureFields.length + index, {
			label: region.label || 'QR Code',
			key: 'qr_code',
			type: 'qr',
			encrypted: false,
			publicVisible: true,
		}),
	);
	const checkboxFields = (layout.checkboxes || []).map((region, index) =>
		fieldFromRegion(
			region,
			offset + photoFields.length + signatureFields.length + qrFields.length + index,
			{
				label: region.label || 'Checkbox',
				key: slugify(region.label || 'checkbox'),
				type: 'checkbox',
				encrypted: false,
				publicVisible: false,
			},
		),
	);

	const seen = new Set();
	return [...textFields, ...photoFields, ...signatureFields, ...qrFields, ...checkboxFields]
		.filter((field) => {
			if (!field.suggested_key || seen.has(field.suggested_key)) return false;
			seen.add(field.suggested_key);
			return true;
		})
		.slice(0, 80);
}

function toTemplateField(suggestion) {
	const box = suggestion.relative_box || {};
	return {
		field_label: suggestion.label,
		field_key: suggestion.suggested_key,
		field_type: suggestion.field_type,
		required: suggestion.required,
		encrypted: suggestion.encrypted,
		public_visible: suggestion.public_visible,
		searchable: suggestion.searchable,
		validation_rule: suggestion.validation_rule || '',
		default_value: '',
		options_json: suggestion.field_type === 'dropdown' ? ['Active', 'Inactive', 'Pending'] : null,
		x_position: Number(box.x || 0),
		y_position: Number(box.y || 0),
		width: Number(box.width || 20),
		height: Number(box.height || 6),
		page_number: Number(box.page || 1),
		sort_order: suggestion.sort_order,
	};
}

export { createFieldSuggestions, toTemplateField };

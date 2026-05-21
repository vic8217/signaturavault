function overlap(a, b) {
	return !(
		a.x + a.width < b.x ||
		b.x + b.width < a.x ||
		a.y + a.height < b.y ||
		b.y + b.height < a.y
	);
}

function normalizeBlock(block) {
	const relative = block.relative_box || {};
	const absolute = block.bounding_box || {};
	return {
		...block,
		text: String(block.text || '').trim(),
		confidence: Number(block.confidence || 0),
		bounding_box: absolute,
		relative_box: {
			x: Number(relative.x ?? 0),
			y: Number(relative.y ?? 0),
			width: Number(relative.width ?? 0),
			height: Number(relative.height ?? 0),
			page: Number(relative.page || absolute.page || 1),
		},
	};
}

function detectQrAreas(blocks) {
	return blocks
		.filter((block) => /\b(qr|scan|code)\b/i.test(block.text))
		.map((block) => ({
			label: block.text,
			confidence: block.confidence,
			bounding_box: block.bounding_box,
			relative_box: block.relative_box,
		}));
}

function detectSignatureAreas(blocks) {
	return blocks
		.filter((block) => /signature|signed|authorized/i.test(block.text))
		.map((block) => ({
			label: block.text,
			confidence: block.confidence,
			bounding_box: block.bounding_box,
			relative_box: {
				...block.relative_box,
				width: Math.max(block.relative_box.width, 18),
				height: Math.max(block.relative_box.height, 6),
			},
		}));
}

function detectPhotoAreas(blocks) {
	return blocks
		.filter((block) => /photo|picture|image|portrait/i.test(block.text))
		.map((block) => ({
			label: block.text,
			confidence: block.confidence,
			bounding_box: block.bounding_box,
			relative_box: {
				...block.relative_box,
				width: Math.max(block.relative_box.width, 14),
				height: Math.max(block.relative_box.height, 18),
			},
		}));
}

function detectCheckboxes(blocks) {
	return blocks
		.filter((block) => /checkbox|consent|agree|\byes\b|\bno\b|\[ \]|\[x\]/i.test(block.text))
		.map((block) => ({
			label: block.text,
			confidence: block.confidence,
			bounding_box: block.bounding_box,
			relative_box: {
				...block.relative_box,
				width: Math.max(block.relative_box.width, 4),
				height: Math.max(block.relative_box.height, 4),
			},
		}));
}

function detectTables(blocks) {
	const rows = new Map();
	for (const block of blocks) {
		const rowKey = `${block.relative_box.page}:${Math.round(block.relative_box.y / 4)}`;
		rows.set(rowKey, [...(rows.get(rowKey) || []), block]);
	}

	return [...rows.values()]
		.filter((row) => row.length >= 3)
		.map((row) => {
			const page = row[0].relative_box.page;
			const x = Math.min(...row.map((block) => block.relative_box.x));
			const y = Math.min(...row.map((block) => block.relative_box.y));
			const right = Math.max(
				...row.map((block) => block.relative_box.x + block.relative_box.width),
			);
			const bottom = Math.max(
				...row.map((block) => block.relative_box.y + block.relative_box.height),
			);
			return {
				confidence: 0.6,
				columns: row.length,
				relative_box: { x, y, width: right - x, height: bottom - y, page },
			};
		});
}

function detectLayoutRegions(ocrResult) {
	const blocks = (ocrResult.text_blocks || []).map(normalizeBlock).filter((block) => block.text);
	const signatureAreas = detectSignatureAreas(blocks);
	const photoAreas = detectPhotoAreas(blocks);
	const qrAreas = detectQrAreas(blocks);
	const checkboxes = detectCheckboxes(blocks);
	const tables = detectTables(blocks);
	const specialAreas = [...signatureAreas, ...photoAreas, ...qrAreas, ...checkboxes];

	const labels = blocks.filter(
		(block) => !specialAreas.some((area) => overlap(area.relative_box, block.relative_box)),
	);

	return {
		text_blocks: blocks,
		labels,
		signature_areas: signatureAreas,
		photo_areas: photoAreas,
		qr_areas: qrAreas,
		checkboxes,
		tables,
	};
}

export { detectLayoutRegions };

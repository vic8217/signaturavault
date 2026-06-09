import crypto from 'node:crypto';

function isPlainObject(value) {
	return (
		typeof value === 'object' &&
		value !== null &&
		!(value instanceof Date) &&
		!Array.isArray(value)
	);
}

function isEmpty(value) {
	return value === null || value === undefined;
}

function valueMatches(actual, expected) {
	if (isEmpty(expected)) {
		return isEmpty(actual);
	}

	if (expected instanceof Date) {
		return actual instanceof Date && actual.getTime() === expected.getTime();
	}

	if (isPlainObject(expected)) {
		if ('gt' in expected) {
			const bound = expected.gt;
			const actualTime = actual instanceof Date ? actual.getTime() : actual;
			const boundTime = bound instanceof Date ? bound.getTime() : bound;
			return actualTime > boundTime;
		}
		if ('gte' in expected) {
			const actualTime = actual instanceof Date ? actual.getTime() : actual;
			const boundTime =
				expected.gte instanceof Date ? expected.gte.getTime() : expected.gte;
			return actualTime >= boundTime;
		}
		if ('lt' in expected) {
			const actualTime = actual instanceof Date ? actual.getTime() : actual;
			const boundTime =
				expected.lt instanceof Date ? expected.lt.getTime() : expected.lt;
			return actualTime < boundTime;
		}
		if ('in' in expected) {
			return Array.isArray(expected.in) && expected.in.includes(actual);
		}
		if ('hasSome' in expected) {
			const candidates = Array.isArray(expected.hasSome) ? expected.hasSome : [];
			const actualArray = Array.isArray(actual) ? actual : [];
			return candidates.some((item) => actualArray.includes(item));
		}
		if ('has' in expected) {
			return Array.isArray(actual) && actual.includes(expected.has);
		}
		// Composite/relation object: every nested field must match.
		return Object.entries(expected).every(([key, nested]) =>
			valueMatches(actual?.[key], nested),
		);
	}

	return actual === expected;
}

function recordMatchesWhere(record, where, compositeKeys) {
	if (!where) return true;

	return Object.entries(where).every(([key, expected]) => {
		if (compositeKeys.has(key) && isPlainObject(expected)) {
			return Object.entries(expected).every(([field, value]) =>
				valueMatches(record[field], value),
			);
		}
		return valueMatches(record[key], expected);
	});
}

function applySelect(record, select) {
	if (!record || !select) return record;
	const projected = {};
	for (const [key, include] of Object.entries(select)) {
		if (include) projected[key] = record[key];
	}
	return projected;
}

function applyOrderBy(records, orderBy) {
	if (!orderBy) return records;
	const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
	const sorted = [...records];
	sorted.sort((a, b) => {
		for (const clause of clauses) {
			for (const [field, direction] of Object.entries(clause)) {
				const av = a[field];
				const bv = b[field];
				if (av === bv) continue;
				const factor = direction === 'desc' ? -1 : 1;
				if (isEmpty(av)) return 1;
				if (isEmpty(bv)) return -1;
				if (av < bv) return -1 * factor;
				return 1 * factor;
			}
		}
		return 0;
	});
	return sorted;
}

function createModel(compositeKeyNames = []) {
	const rows = [];
	const compositeKeys = new Set(compositeKeyNames);

	function clone(record) {
		return record ? { ...record } : record;
	}

	return {
		__rows: rows,
		__clear() {
			rows.length = 0;
		},
		__seed(records) {
			for (const record of records) {
				rows.push({ ...record });
			}
		},
		async findFirst({ where, select, orderBy } = {}) {
			const matches = applyOrderBy(
				rows.filter((record) => recordMatchesWhere(record, where, compositeKeys)),
				orderBy,
			);
			return matches.length ? applySelect(clone(matches[0]), select) : null;
		},
		async findUnique({ where, select } = {}) {
			const match = rows.find((record) =>
				recordMatchesWhere(record, where, compositeKeys),
			);
			return match ? applySelect(clone(match), select) : null;
		},
		async findMany({ where, select, orderBy } = {}) {
			const matches = applyOrderBy(
				rows.filter((record) => recordMatchesWhere(record, where, compositeKeys)),
				orderBy,
			);
			return matches.map((record) => applySelect(clone(record), select));
		},
		async count({ where } = {}) {
			return rows.filter((record) => recordMatchesWhere(record, where, compositeKeys))
				.length;
		},
		async create({ data, select } = {}) {
			const record = { id: data.id ?? crypto.randomUUID(), ...data };
			if (record.createdAt === undefined) record.createdAt = new Date();
			rows.push(record);
			return applySelect(clone(record), select);
		},
		async update({ where, data, select } = {}) {
			const record = rows.find((row) =>
				recordMatchesWhere(row, where, compositeKeys),
			);
			if (!record) throw new Error('Record to update not found');
			Object.assign(record, data);
			return applySelect(clone(record), select);
		},
		async updateMany({ where, data } = {}) {
			let count = 0;
			for (const record of rows) {
				if (recordMatchesWhere(record, where, compositeKeys)) {
					Object.assign(record, data);
					count += 1;
				}
			}
			return { count };
		},
		async upsert({ where, create, update, select } = {}) {
			const record = rows.find((row) =>
				recordMatchesWhere(row, where, compositeKeys),
			);
			if (record) {
				Object.assign(record, update);
				return applySelect(clone(record), select);
			}
			const created = { id: create.id ?? crypto.randomUUID(), ...create };
			if (created.createdAt === undefined) created.createdAt = new Date();
			rows.push(created);
			return applySelect(clone(created), select);
		},
		async deleteMany({ where } = {}) {
			let count = 0;
			for (let i = rows.length - 1; i >= 0; i -= 1) {
				if (recordMatchesWhere(rows[i], where, compositeKeys)) {
					rows.splice(i, 1);
					count += 1;
				}
			}
			return { count };
		},
	};
}

export function createFakePrisma() {
	const models = {
		user: createModel(),
		issuerUser: createModel(),
		trustedDevice: createModel(),
		consent: createModel(),
		privateFieldKeyReference: createModel(),
		privateFieldKeyAuthorization: createModel(),
		encryptedPrivateField: createModel([
			'tenantId_recordType_recordId_fieldKey',
		]),
		auditLog: createModel(),
		securityAuditLog: createModel(),
		apiClient: createModel(),
		signaturaSession: createModel(),
	};

	return {
		...models,
		__reset() {
			for (const model of Object.values(models)) {
				model.__clear();
			}
		},
		__seed(seed = {}) {
			for (const [modelName, records] of Object.entries(seed)) {
				if (models[modelName]) models[modelName].__seed(records);
			}
		},
	};
}

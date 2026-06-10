import crypto from 'crypto';

function publishedAt() {
	return new Date().toISOString();
}

function buildAnchorCommitment({ batchId, merkleRoot, batchSize, publishMethod }) {
	return Buffer.from(
		JSON.stringify({
			type: 'audit_anchor_commitment',
			batchId,
			merkleRoot,
			batchSize,
			publishMethod,
			publishedAt: publishedAt(),
		}),
	).toString('base64');
}

class AuditAnchorPublisher {
	constructor({ publishMethod = 'audit_anchor' } = {}) {
		this.publishMethod = publishMethod;
	}

	async publishMerkleRoot({ batchId, merkleRoot, batchSize }) {
		return {
			publishMethod: this.publishMethod,
			chain: 'signatura_audit',
			transactionId: `anchor_${crypto
				.createHash('sha256')
				.update(`${batchId}:${merkleRoot}`)
				.digest('hex')
				.slice(0, 24)}`,
			blockNumber: null,
			timestampProof: buildAnchorCommitment({
				batchId,
				merkleRoot,
				batchSize,
				publishMethod: this.publishMethod,
			}),
			publishedAt: publishedAt(),
			status: 'published',
		};
	}
}

class MockPublisher extends AuditAnchorPublisher {
	constructor() {
		super({ publishMethod: 'mock' });
	}
}

class BlockchainPublisher {
	constructor({ publishMethod = 'public_chain' } = {}) {
		this.publishMethod = publishMethod;
	}

	async publishMerkleRoot({ merkleRoot }) {
		const runtimeImport = new Function('specifier', 'return import(specifier)');
		let ethers;
		try {
			({ ethers } = await runtimeImport('ethers'));
		} catch {
			throw new Error(
				'ethers is required for EVM publishing. Install ethers or use audit_anchor/mock.',
			);
		}
		const rpcUrl = process.env.ANCHOR_RPC_URL;
		const privateKey = process.env.ANCHOR_PRIVATE_KEY;
		const chain = process.env.ANCHOR_CHAIN || 'evm';
		if (!rpcUrl || !privateKey) {
			throw new Error('ANCHOR_RPC_URL and ANCHOR_PRIVATE_KEY are required');
		}

		const provider = new ethers.JsonRpcProvider(rpcUrl);
		const wallet = new ethers.Wallet(privateKey, provider);
		const tx = await wallet.sendTransaction({
			to: process.env.ANCHOR_TO_ADDRESS || wallet.address,
			value: 0,
			data: `0x${merkleRoot}`,
		});
		const receipt = await tx.wait(Number(process.env.ANCHOR_CONFIRMATIONS || 1));

		return {
			publishMethod: this.publishMethod,
			chain,
			transactionId: tx.hash,
			blockNumber: receipt?.blockNumber || null,
			timestampProof: null,
			publishedAt: publishedAt(),
			status: 'published',
		};
	}
}

class L2Publisher extends BlockchainPublisher {
	constructor() {
		super({ publishMethod: 'l2_chain' });
	}
}

function createPublisher(method = process.env.ANCHOR_PUBLISH_METHOD || 'audit_anchor') {
	const normalized =
		method === 'mock' || method === 'opentimestamps' ? 'audit_anchor' : method;
	if (process.env.NODE_ENV === 'production' && normalized === 'mock') {
		throw new Error('Mock anchoring is disabled in production');
	}
	if (normalized === 'audit_anchor') return new AuditAnchorPublisher();
	if (normalized === 'public_chain') return new BlockchainPublisher();
	if (normalized === 'l2_chain') return new L2Publisher();
	return new MockPublisher();
}

function parseAnchorCommitment(timestampProof) {
	if (!timestampProof) return null;
	try {
		const decoded = Buffer.from(timestampProof, 'base64').toString('utf8');
		const payload = JSON.parse(decoded);
		if (!payload?.merkleRoot) return null;
		return payload;
	} catch {
		return null;
	}
}

function verifyAnchorCommitment({ merkleRoot, timestampProof }) {
	const commitment = parseAnchorCommitment(timestampProof);
	if (!commitment) {
		return { verified: false };
	}
	return {
		verified: commitment.merkleRoot === merkleRoot,
		chain: 'signatura_audit',
		blockNumber: null,
		publishedAt: commitment.publishedAt || null,
		commitment,
	};
}

export {
	AuditAnchorPublisher,
	BlockchainPublisher,
	L2Publisher,
	MockPublisher,
	createPublisher,
	parseAnchorCommitment,
	verifyAnchorCommitment,
};

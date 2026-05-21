import crypto from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

function publishedAt() {
	return new Date().toISOString();
}

class MockPublisher {
	async publishMerkleRoot({ batchId, merkleRoot, batchSize }) {
		return {
			publishMethod: 'mock',
			chain: 'local_mock',
			transactionId: `mock_tx_${crypto
				.createHash('sha256')
				.update(`${batchId}:${merkleRoot}`)
				.digest('hex')
				.slice(0, 24)}`,
			blockNumber: null,
			timestampProof: Buffer.from(
				JSON.stringify({
					type: 'mock_timestamp_proof',
					batchId,
					merkleRoot,
					batchSize,
					publishedAt: publishedAt(),
				}),
			).toString('base64'),
			publishedAt: publishedAt(),
			status: 'published',
		};
	}
}

class OpenTimestampsPublisher {
	openTimestamps() {
		return require('opentimestamps');
	}

	rootFileBytes(merkleRoot) {
		return Buffer.from(`${merkleRoot}\n`, 'utf8');
	}

	async stampRootBytes(rootBytes) {
		const OpenTimestamps = this.openTimestamps();
		const detached = OpenTimestamps.DetachedTimestampFile.fromBytes(
			new OpenTimestamps.Ops.OpSHA256(),
			rootBytes,
		);
		await OpenTimestamps.stamp(detached);
		return Buffer.from(detached.serializeToBytes());
	}

	async publishMerkleRoot({ batchId, merkleRoot }) {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'signatura-ots-'));
		const rootPath = path.join(tmpDir, `${batchId}.txt`);

		try {
			const rootBytes = this.rootFileBytes(merkleRoot);
			await writeFile(rootPath, rootBytes);
			const proof = await this.stampRootBytes(rootBytes);
			return {
				publishMethod: 'opentimestamps',
				chain: 'bitcoin_timestamp',
				transactionId: null,
				blockNumber: null,
				timestampProof: proof.toString('base64'),
				publishedAt: null,
				status: 'timestamped_pending_confirmation',
			};
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	}

	async upgradeTimestampProof({ merkleRoot, timestampProof }) {
		const OpenTimestamps = this.openTimestamps();
		const proofBytes = Buffer.from(timestampProof, 'base64');
		const rootBytes = this.rootFileBytes(merkleRoot);
		const detached = OpenTimestamps.DetachedTimestampFile.deserialize(proofBytes);
		const changed = await OpenTimestamps.upgrade(detached);
		const upgradedProof = Buffer.from(detached.serializeToBytes()).toString('base64');
		const verification = await this.verifyTimestampProof({
			merkleRoot,
			timestampProof: upgradedProof,
		});

		return {
			changed,
			timestampProof: upgradedProof,
			verified: verification.verified,
			blockNumber: verification.blockNumber,
			publishedAt: verification.publishedAt,
			rootBytes,
		};
	}

	async verifyTimestampProof({ merkleRoot, timestampProof }) {
		const OpenTimestamps = this.openTimestamps();
		const proofBytes = Buffer.from(timestampProof, 'base64');
		const rootBytes = this.rootFileBytes(merkleRoot);
		const detachedOriginal = OpenTimestamps.DetachedTimestampFile.fromBytes(
			new OpenTimestamps.Ops.OpSHA256(),
			rootBytes,
		);
		const detachedStamped = OpenTimestamps.DetachedTimestampFile.deserialize(proofBytes);
		const result = await OpenTimestamps.verify(detachedStamped, detachedOriginal, {
			ignoreBitcoinNode: true,
			timeout: Number(process.env.OPENTIMESTAMPS_VERIFY_TIMEOUT_MS || 5000),
		});
		const bitcoin = result?.bitcoin;

		return {
			verified: Boolean(bitcoin),
			chain: bitcoin ? 'bitcoin_timestamp' : null,
			blockNumber: bitcoin?.height ? String(bitcoin.height) : null,
			publishedAt: bitcoin?.timestamp
				? new Date(bitcoin.timestamp * 1000).toISOString()
				: null,
			raw: result,
		};
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
			throw new Error('ethers is required for EVM publishing. Install ethers or use mock/opentimestamps.');
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

function createPublisher(method = process.env.ANCHOR_PUBLISH_METHOD || 'mock') {
	if (method === 'opentimestamps') return new OpenTimestampsPublisher();
	if (method === 'public_chain') return new BlockchainPublisher();
	if (method === 'l2_chain') return new L2Publisher();
	return new MockPublisher();
}

export {
	BlockchainPublisher,
	L2Publisher,
	MockPublisher,
	OpenTimestampsPublisher,
	createPublisher,
};

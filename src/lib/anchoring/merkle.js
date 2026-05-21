import crypto from 'crypto';

function sha256Hex(value) {
	return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function documentLeafHash(documentHash, documentId) {
	return sha256Hex(`${documentHash}:${documentId}`);
}

function parentHash(left, right) {
	return sha256Hex(`${left}:${right}`);
}

function buildMerkleTree(leaves) {
	if (!Array.isArray(leaves) || leaves.length === 0) {
		throw new Error('Cannot build a Merkle tree without leaves');
	}

	const levels = [leaves.map((leaf) => leaf.leafHash)];
	while (levels.at(-1).length > 1) {
		const current = levels.at(-1);
		const next = [];
		for (let index = 0; index < current.length; index += 2) {
			const left = current[index];
			const right = current[index + 1] || left;
			next.push(parentHash(left, right));
		}
		levels.push(next);
	}

	return {
		merkleRoot: levels.at(-1)[0],
		levels,
	};
}

function proofForLeaf(levels, proofIndex) {
	const proofPath = [];
	let index = proofIndex;

	for (let level = 0; level < levels.length - 1; level += 1) {
		const nodes = levels[level];
		const isRightNode = index % 2 === 1;
		const siblingIndex = isRightNode ? index - 1 : index + 1;
		const siblingHash = nodes[siblingIndex] || nodes[index];
		proofPath.push({
			position: isRightNode ? 'left' : 'right',
			hash: siblingHash,
		});
		index = Math.floor(index / 2);
	}

	return proofPath;
}

function verifyMerkleProof({ leafHash, proofPath, merkleRoot }) {
	let current = leafHash;
	for (const proof of proofPath || []) {
		if (proof.position === 'left') {
			current = parentHash(proof.hash, current);
		} else if (proof.position === 'right') {
			current = parentHash(current, proof.hash);
		} else {
			return false;
		}
	}
	return current === merkleRoot;
}

export {
	buildMerkleTree,
	documentLeafHash,
	proofForLeaf,
	sha256Hex,
	verifyMerkleProof,
};

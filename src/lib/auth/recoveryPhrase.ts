import crypto from 'crypto';
import { hashRecoveryCode } from '@/lib/webauthn';

const RECOVERY_WORDS = [
	'anchor', 'arctic', 'beacon', 'bridge', 'canyon', 'cipher', 'compass', 'coral',
	'delta', 'ember', 'falcon', 'forest', 'galaxy', 'harbor', 'horizon', 'island',
	'juniper', 'kernel', 'lantern', 'meadow', 'mirror', 'nebula', 'ocean', 'orbit',
	'pebble', 'pillar', 'prairie', 'quartz', 'river', 'saffron', 'signal', 'summit',
	'timber', 'valley', 'vector', 'violet', 'winter', 'zenith', 'amber', 'breeze',
	'cedar', 'dawn', 'eagle', 'flint', 'grove', 'haven', 'ivory', 'jade',
	'kite', 'lotus', 'maple', 'north', 'oasis', 'pearl', 'quest', 'ridge',
	'shadow', 'terra', 'union', 'vista', 'willow', 'xenon', 'yarrow', 'zephyr',
];

export function makeRecoveryPhrase(wordCount = 12) {
	const words: string[] = [];
	for (let index = 0; index < wordCount; index += 1) {
		words.push(RECOVERY_WORDS[crypto.randomInt(0, RECOVERY_WORDS.length)]);
	}
	return words.join(' ');
}

export function normalizeRecoveryPhrase(phrase: string) {
	return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashRecoveryPhrase(phrase: string) {
	return hashRecoveryCode(normalizeRecoveryPhrase(phrase));
}

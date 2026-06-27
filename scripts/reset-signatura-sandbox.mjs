import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const legacyDbPath = path.join(root, 'data', 'db.json');

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		stdio: 'inherit',
		shell: process.platform === 'win32',
		env: {
			...process.env,
			...options.env,
		},
	});

	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

console.log('Removing legacy JSON issuer store:', legacyDbPath);
rmSync(legacyDbPath, { force: true });

console.log('Resetting Prisma database...');
run('npx', ['prisma', 'db', 'push', '--force-reset']);

console.log('Running Prisma seed...');
run('npx', ['prisma', 'db', 'seed'], {
	env: {
		SEED_RESET: '1',
	},
});

console.log('Sandbox reset complete. Restart the running app process if needed.');

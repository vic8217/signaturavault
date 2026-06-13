#!/usr/bin/env node
/**
 * Preflight checks for local HavenxSig + Signatura integration testing.
 * Read-only: does not modify databases or start servers.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const signaturaRoot = path.resolve(__dirname, "..");
const havenRoot = path.resolve(signaturaRoot, "..", "havenxsig");

const SIGNATURA_URL = (
	process.env.SIGNATURA_PUBLIC_URL ||
	process.env.SIGNATURA_API_URL ||
	"http://localhost:3000"
).replace(/\/+$/, "");

const HAVEN_URL = (
	process.env.HAVENXSIG_ORIGIN ||
	process.env.NEXT_PUBLIC_HAVENXSIG_URL ||
	"http://localhost:3001"
).replace(/\/+$/, "");

function parseEnvFile(filePath) {
	if (!existsSync(filePath)) return {};
	const values = {};
	for (const line of readFileSync(filePath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

function status(ok, label, detail = "") {
	const icon = ok ? "✓" : "✗";
	const suffix = detail ? ` — ${detail}` : "";
	console.log(`${icon} ${label}${suffix}`);
	return ok;
}

async function probe(url, label) {
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
		});
		return status(
			response.ok || response.status < 500,
			`${label} reachable`,
			`${url} (${response.status})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return status(false, `${label} reachable`, `${url} (${message})`);
	}
}

async function main() {
	console.log("HavenxSig + Signatura dev preflight\n");

	const signaturaEnv = parseEnvFile(path.join(signaturaRoot, ".env"));
	const havenEnv = parseEnvFile(path.join(havenRoot, ".env.local"));
	const havenEnvFallback = parseEnvFile(path.join(havenRoot, ".env"));
	const mergedHaven = { ...havenEnvFallback, ...havenEnv };

	let ok = true;

	ok =
		status(existsSync(signaturaRoot), "Signatura repo", signaturaRoot) && ok;
	ok = status(existsSync(havenRoot), "HavenxSig repo", havenRoot) && ok;

	const signaturaSecret =
		signaturaEnv.HAVENXSIG_CLIENT_SECRET?.trim() ||
		signaturaEnv.HAVEN_SIGNATURA_SERVICE_SECRET?.trim() ||
		"";
	const havenSecret = mergedHaven.SIGNATURA_CLIENT_SECRET?.trim() || "";

	ok =
		status(Boolean(signaturaSecret), "Signatura HAVENXSIG_CLIENT_SECRET set") &&
		ok;
	ok =
		status(Boolean(havenSecret), "HavenxSig SIGNATURA_CLIENT_SECRET set") && ok;

	if (signaturaSecret && havenSecret) {
		ok =
			status(
				signaturaSecret === havenSecret,
				"OAuth secrets match between apps",
			) && ok;
	}

	const signaturaCallback = signaturaEnv.HAVENXSIG_CALLBACK_URL?.trim();
	const havenCallback =
		mergedHaven.SIGNATURA_CALLBACK_URL?.trim() ||
		"http://localhost:3001/auth/callback";
	ok =
		status(
			!signaturaCallback || signaturaCallback === havenCallback,
			"OAuth callback URL aligned",
			signaturaCallback || havenCallback,
		) && ok;

	const mockAllow = mergedHaven.SIGNATURA_ZERO_TRUST_MOCK_ALLOW?.trim();
	ok =
		status(
			!mockAllow || mockAllow === "false" || mockAllow === "0",
			"Full integration mode (mock disabled)",
			mockAllow ? `SIGNATURA_ZERO_TRUST_MOCK_ALLOW=${mockAllow}` : "unset",
		) && ok;

	if (mockAllow === "true" || mockAllow === "1") {
		console.log(
			"  ℹ Mock mode skips real Signatura unlock — unset for integration test.",
		);
	}

	console.log("");
	ok = (await probe(`${SIGNATURA_URL}/register`, "Signatura")) && ok;
	ok = (await probe(`${HAVEN_URL}/login`, "HavenxSig")) && ok;

	console.log("\nNext steps:");
	console.log("  1. Start Signatura:  cd signaturavaultv1 && npm run dev");
	console.log("  2. Start HavenxSig:  cd havenxsig && npm run dev");
	console.log("  3. Seed demo HOA:    cd havenxsig && npm run seed:demo-hoa");
	console.log("  4. Follow:           docs/TEST_HOA_SIGNATURA_INTEGRATION.md");

	if (!ok) {
		console.log("\nPreflight: FAILED — fix items above before integration test.");
		process.exit(1);
	}

	console.log("\nPreflight: OK — ready for manual integration test.");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

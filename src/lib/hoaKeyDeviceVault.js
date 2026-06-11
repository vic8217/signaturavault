"use client";

const VAULT_VERSION = 2;

function vaultKey(tenantId) {
  return `signatura_hoa_key_vault_${tenantId}`;
}

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function deriveVaultKey(tenantId, credentialId) {
  const material = new TextEncoder().encode(`${tenantId}:${credentialId}:signatura-hoa-vault-v1`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function readDeviceVaultMetadata(tenantId) {
  const raw = localStorage.getItem(vaultKey(tenantId));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    return {
      credentialId: payload.credentialId || null,
      keyRef: payload.keyRef || null,
      version: payload.v || 1,
      updatedAt: payload.updatedAt || null,
    };
  } catch {
    return null;
  }
}

export function clearHoaKeyDeviceVault(tenantId) {
  localStorage.removeItem(vaultKey(String(tenantId ?? "").trim()));
}

export async function storeHoaKeyInDeviceVault({
  tenantId,
  credentialId,
  hoaKey,
  keyRef,
}) {
  if (!tenantId || !credentialId || !hoaKey || !keyRef) {
    throw new Error(
      "Device vault storage requires tenant, credential, HOA key, and key reference.",
    );
  }
  const aesKey = await deriveVaultKey(tenantId, credentialId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(String(hoaKey)),
  );
  const payload = {
    v: VAULT_VERSION,
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(new Uint8Array(ciphertext)),
    credentialId,
    keyRef: String(keyRef).trim(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(vaultKey(tenantId), JSON.stringify(payload));
}

function base64urlToBytes(value) {
	const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function unlockHoaKeyFromDeviceVault({
	tenantId,
	credentialId,
	keyRef = null,
}) {
	const raw = localStorage.getItem(vaultKey(tenantId));
	if (!raw) {
		throw new Error('No HOA encryption key is stored on this trusted device.');
	}
	const payload = JSON.parse(raw);
	if (payload.credentialId !== credentialId) {
		throw new Error(
			'Stored HOA key belongs to a different passkey on this device. Re-enroll using the same passkey you use to approve.',
		);
	}
	const expectedKeyRef = String(keyRef ?? '').trim();
	if (expectedKeyRef) {
		if (!payload.keyRef || payload.keyRef !== expectedKeyRef) {
			throw new Error(
				'Stored HOA key is out of date for this HOA. Open HOA key setup, import the current enrolled key, and try again.',
			);
		}
	}
	const aesKey = await deriveVaultKey(tenantId, credentialId);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64urlToBytes(payload.iv) },
		aesKey,
		base64urlToBytes(payload.ciphertext),
	);
	return new TextDecoder().decode(plaintext);
}

export function hasHoaKeyInDeviceVault(tenantId, expectedKeyRef = null) {
  const metadata = readDeviceVaultMetadata(tenantId);
  if (!metadata?.credentialId) return false;
  const keyRef = String(expectedKeyRef ?? '').trim();
  if (!keyRef) return true;
  return metadata.keyRef === keyRef;
}

export function listHoaKeyVaultTenantIds() {
  const prefix = "signatura_hoa_key_vault_";
  const tenantIds = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) {
      tenantIds.push(key.slice(prefix.length));
    }
  }
  return tenantIds;
}

export function resolveDeviceVaultTenantId(preferredTenantId, expectedKeyRef = null) {
  const preferred = String(preferredTenantId ?? "").trim();
  if (!preferred) return null;
  return hasHoaKeyInDeviceVault(preferred, expectedKeyRef) ? preferred : null;
}

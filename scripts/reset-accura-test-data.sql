-- Reset Signatura Vault ACCURA registration/login test data.
-- Targets users linked to ACCURA and SIG-ACCURA-* identities.

BEGIN;

CREATE TEMP TABLE accura_user_ids ON COMMIT DROP AS
SELECT id
FROM users
WHERE signatura_id LIKE 'SIG-ACCURA%'
   OR id IN (
		SELECT user_id
		FROM signatura_app_links
		WHERE source_app = 'ACCURA'
	);

DELETE FROM accura_registration_handoffs
WHERE user_id IN (SELECT id FROM accura_user_ids)
   OR signatura_id LIKE 'SIG-ACCURA%';

DELETE FROM trusted_device_login_challenges
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM auth_challenges
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM trusted_devices
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM webauthn_credentials
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM signatura_sessions
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM signatura_app_links
WHERE source_app = 'ACCURA'
   OR user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM security_event_logs
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM security_audit_logs
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM account_recovery_requests
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM recovery_codes
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM consents
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM authorization_codes
WHERE user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM encrypted_private_fields
WHERE owner_user_id IN (SELECT id FROM accura_user_ids);

DELETE FROM users
WHERE id IN (SELECT id FROM accura_user_ids);

COMMIT;

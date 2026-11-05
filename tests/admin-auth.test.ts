import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createAdminSession,
	isAdminAuthConfigured,
	isAdminSessionValid,
	verifyAdminCredentials,
	verifyAdminSession
} from '../src/lib/server/admin-auth.ts';

const credentials = {
	ADMIN_USERNAME: 'lia-admin',
	ADMIN_PASSWORD: 'local-password-with-more-than-thirty-two-characters',
	ADMIN_SESSION_SECRET: 'local-session-secret-with-more-than-thirty-two-characters'
};

test('admin credentials require configured, sufficiently long secrets', () => {
	assert.equal(isAdminAuthConfigured(credentials), true);
	assert.equal(isAdminAuthConfigured({ ...credentials, ADMIN_PASSWORD: 'short' }), false);
	assert.equal(verifyAdminCredentials('lia-admin', credentials.ADMIN_PASSWORD, credentials), true);
	assert.equal(
		verifyAdminCredentials('wrong-user', credentials.ADMIN_PASSWORD, credentials),
		false
	);
});

test('admin session is signed, valid until expiry, and rejects invalid or expired tokens', async () => {
	const now = Date.UTC(2026, 10, 4, 12, 0, 0);
	const token = await createAdminSession(credentials.ADMIN_SESSION_SECRET, now);

	assert.equal(await verifyAdminSession(token, credentials.ADMIN_SESSION_SECRET, now + 1000), true);
	assert.equal(await isAdminSessionValid(token, credentials, now + 1000), true);
	assert.equal(await isAdminSessionValid(undefined, credentials, now), false);
	assert.equal(await verifyAdminSession(`${token}x`, credentials.ADMIN_SESSION_SECRET, now), false);
	assert.equal(
		await verifyAdminSession(token, credentials.ADMIN_SESSION_SECRET, now + 9 * 60 * 60 * 1000),
		false
	);
});

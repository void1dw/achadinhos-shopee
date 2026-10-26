export const ADMIN_SESSION_COOKIE = 'lia_admin_session';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

const MIN_SECRET_LENGTH = 32;
const SESSION_PREFIX = 'achadinhos-lia-admin:v1:';

type AdminCredentials = Pick<
	Cloudflare.Env,
	'ADMIN_USERNAME' | 'ADMIN_PASSWORD' | 'ADMIN_SESSION_SECRET'
>;

function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	let difference = leftBytes.length ^ rightBytes.length;
	for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index++) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signSession(expiry: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${SESSION_PREFIX}${expiry}`)
	);
	return base64Url(new Uint8Array(signature));
}

export function isAdminAuthConfigured(env: AdminCredentials): boolean {
	return Boolean(
		env.ADMIN_USERNAME &&
		env.ADMIN_PASSWORD &&
		env.ADMIN_PASSWORD.length >= MIN_SECRET_LENGTH &&
		env.ADMIN_SESSION_SECRET &&
		env.ADMIN_SESSION_SECRET.length >= MIN_SECRET_LENGTH
	);
}

export function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	return origin !== null && origin === new URL(request.url).origin;
}

export function verifyAdminCredentials(
	username: string,
	password: string,
	env: AdminCredentials
): boolean {
	const expectedUsername = env.ADMIN_USERNAME;
	const expectedPassword = env.ADMIN_PASSWORD;
	if (
		!expectedUsername ||
		!expectedPassword ||
		expectedPassword.length < MIN_SECRET_LENGTH ||
		!env.ADMIN_SESSION_SECRET ||
		env.ADMIN_SESSION_SECRET.length < MIN_SECRET_LENGTH
	) {
		return false;
	}
	return (
		constantTimeEqual(username, expectedUsername) && constantTimeEqual(password, expectedPassword)
	);
}

export async function createAdminSession(secret: string, now = Date.now()): Promise<string> {
	const expiry = String(Math.floor(now / 1000) + ADMIN_SESSION_SECONDS);
	return `${expiry}.${await signSession(expiry, secret)}`;
}

export async function verifyAdminSession(
	token: string | undefined,
	secret: string | undefined,
	now = Date.now()
): Promise<boolean> {
	if (!token || !secret || secret.length < MIN_SECRET_LENGTH) return false;
	const [expiry, signature, extra] = token.split('.');
	if (!expiry || !signature || extra !== undefined || !/^\d{10}$/.test(expiry)) return false;
	const expiresAt = Number(expiry);
	const nowSeconds = Math.floor(now / 1000);
	if (expiresAt <= nowSeconds || expiresAt > nowSeconds + ADMIN_SESSION_SECONDS) return false;
	return constantTimeEqual(signature, await signSession(expiry, secret));
}

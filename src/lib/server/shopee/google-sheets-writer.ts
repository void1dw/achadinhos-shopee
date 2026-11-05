import { createServiceAssertion } from '../ga4-reporting';
import { FIELDS, normalizeHeader } from '../sheets';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUEST_TIMEOUT_MS = 15_000;

export type SheetsEnv = Pick<
	Cloudflare.Env,
	| 'GOOGLE_SHEETS_SPREADSHEET_ID'
	| 'GOOGLE_SHEETS_SHEET_NAME'
	| 'GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL'
	| 'GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY'
>;

export type SheetsWriteConfig = {
	spreadsheetId: string;
	sheetName: string;
	email: string;
	privateKey: string;
};

const REQUIRED_VARIABLES = [
	'GOOGLE_SHEETS_SPREADSHEET_ID',
	'GOOGLE_SHEETS_SHEET_NAME',
	'GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL',
	'GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY'
] as const;

const SPREADSHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
const SHEET_NAME = /^[\p{L}\p{N} _.-]{1,100}$/u;

export type SheetsWriteConfigResult =
	| { configured: true; config: SheetsWriteConfig }
	| { configured: false; missing: string[]; invalid: string[] };

/** Só nomes das variáveis são devolvidos; valores nunca aparecem em mensagens. */
export function getSheetsWriteConfig(env: SheetsEnv): SheetsWriteConfigResult {
	const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
	if (missing.length > 0) return { configured: false, missing, invalid: [] };
	const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID!.trim();
	const sheetName = env.GOOGLE_SHEETS_SHEET_NAME!.trim();
	const invalid: string[] = [];
	if (!SPREADSHEET_ID.test(spreadsheetId)) invalid.push('GOOGLE_SHEETS_SPREADSHEET_ID');
	if (!SHEET_NAME.test(sheetName)) invalid.push('GOOGLE_SHEETS_SHEET_NAME');
	if (invalid.length > 0) return { configured: false, missing: [], invalid };
	return {
		configured: true,
		config: {
			spreadsheetId,
			sheetName,
			email: env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!.trim(),
			privateKey: env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY!
		}
	};
}

export class SheetsWriteError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
		this.name = 'SheetsWriteError';
	}
}

/** Linha no formato lógico da planilha; a ordem das colunas vem do cabeçalho real. */
export type SheetRow = {
	id: string;
	name: string;
	category: string;
	price: string;
	previous: string;
	image: string;
	url: string;
	date: string;
};

type FieldKey = keyof typeof FIELDS;
const REQUIRED_FIELDS: readonly FieldKey[] = ['name', 'category', 'price', 'image', 'url'];

async function request(
	fetcher: typeof fetch,
	url: string,
	init: RequestInit
): Promise<Record<string, unknown>> {
	let response: Response;
	try {
		response = await fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	} catch {
		throw new SheetsWriteError('SHEETS_REQUEST_FAILED', 'A requisição ao Google Sheets falhou.');
	}
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new SheetsWriteError(
			response.status === 401 || response.status === 403
				? 'SHEETS_ACCESS_DENIED'
				: 'SHEETS_HTTP_ERROR',
			`O Google Sheets respondeu com HTTP ${response.status}. Confirme se a planilha foi compartilhada com a conta de serviço como editora.`
		);
	}
	if (typeof body !== 'object' || body === null) {
		throw new SheetsWriteError('SHEETS_INVALID_RESPONSE', 'Resposta inválida do Google Sheets.');
	}
	return body as Record<string, unknown>;
}

async function accessToken(config: SheetsWriteConfig, fetcher: typeof fetch): Promise<string> {
	let assertion: string;
	try {
		assertion = await createServiceAssertion(config.email, config.privateKey, SHEETS_SCOPE);
	} catch {
		throw new SheetsWriteError(
			'SHEETS_INVALID_CREDENTIALS',
			'A chave privada da conta de serviço é inválida.'
		);
	}
	const body = await request(fetcher, TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion
		})
	});
	if (typeof body.access_token !== 'string') {
		throw new SheetsWriteError('SHEETS_AUTH_FAILED', 'Não foi possível autenticar no Google.');
	}
	return body.access_token;
}

function columnMap(header: readonly string[]): Record<FieldKey, number> {
	const normalized = header.map((cell) => normalizeHeader(String(cell)));
	return Object.fromEntries(
		(Object.keys(FIELDS) as FieldKey[]).map((key) => [
			key,
			normalized.findIndex((name) => (FIELDS[key] as readonly string[]).includes(name))
		])
	) as Record<FieldKey, number>;
}

function valuesRange(config: SheetsWriteConfig, suffix = ''): string {
	return `${SHEETS_API}/${config.spreadsheetId}/values/${encodeURIComponent(`'${config.sheetName}'${suffix}`)}`;
}

export type SheetSnapshot = {
	header: string[];
	columns: Record<FieldKey, number>;
	ids: Set<string>;
	urls: Set<string>;
};

/** Lê o cabeçalho e os identificadores atuais da planilha real (somente leitura). */
export async function readSheetSnapshot(
	config: SheetsWriteConfig,
	fetcher: typeof fetch = fetch,
	token?: string
): Promise<SheetSnapshot> {
	const bearer = token ?? (await accessToken(config, fetcher));
	const body = await request(fetcher, valuesRange(config), {
		headers: { authorization: `Bearer ${bearer}` }
	});
	const values = Array.isArray(body.values) ? (body.values as unknown[][]) : [];
	const header = (values[0] ?? []).map(String);
	const columns = columnMap(header);
	const missing = REQUIRED_FIELDS.filter((key) => columns[key] < 0);
	if (header.length === 0 || missing.length > 0) {
		throw new SheetsWriteError(
			'SHEETS_HEADER_MISMATCH',
			'O cabeçalho da planilha não contém todas as colunas esperadas (nome, categoria, preco, imagem, url).'
		);
	}
	const ids = new Set<string>();
	const urls = new Set<string>();
	for (const row of values.slice(1)) {
		const id = String(row[columns.id] ?? '')
			.trim()
			.toLowerCase();
		const url = String(row[columns.url] ?? '')
			.trim()
			.toLowerCase();
		if (id) ids.add(id);
		if (url) urls.add(url);
	}
	return { header, columns, ids, urls };
}

/** Converte a linha lógica para a ordem de colunas do cabeçalho real, preservando colunas extras vazias. */
export function toSheetValues(row: SheetRow, snapshot: SheetSnapshot): string[] {
	const cells = new Array<string>(snapshot.header.length).fill('');
	for (const key of Object.keys(FIELDS) as FieldKey[]) {
		const index = snapshot.columns[key];
		if (index >= 0) cells[index] = row[key];
	}
	return cells;
}

/**
 * Adiciona linhas ao final da planilha. Nunca altera nem remove linhas existentes.
 * Recusa a gravação se o cabeçalho divergir ou se algum id/URL já existir na planilha real.
 */
export async function appendRowsToSheet(
	config: SheetsWriteConfig,
	rows: readonly SheetRow[],
	fetcher: typeof fetch = fetch
): Promise<{ appendedRows: number }> {
	if (rows.length === 0) return { appendedRows: 0 };
	const token = await accessToken(config, fetcher);
	const snapshot = await readSheetSnapshot(config, fetcher, token);
	for (const row of rows) {
		if (snapshot.ids.has(row.id.toLowerCase()) || snapshot.urls.has(row.url.toLowerCase())) {
			throw new SheetsWriteError(
				'SHEETS_DUPLICATE',
				'Um dos produtos já existe na planilha (id ou URL). Nada foi gravado; gere uma nova prévia.'
			);
		}
	}
	const body = await request(
		fetcher,
		`${valuesRange(config, '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
		{
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				majorDimension: 'ROWS',
				values: rows.map((row) => toSheetValues(row, snapshot))
			})
		}
	);
	const updates = body.updates as { updatedRows?: unknown } | undefined;
	const written = typeof updates?.updatedRows === 'number' ? updates.updatedRows : 0;
	if (written !== rows.length) {
		throw new SheetsWriteError(
			'SHEETS_WRITE_UNCONFIRMED',
			`O Google Sheets confirmou ${written} de ${rows.length} linha(s). Confira a planilha antes de repetir.`
		);
	}
	return { appendedRows: written };
}

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import {
	appendRowsToSheet,
	getSheetsWriteConfig,
	SheetsWriteError,
	type SheetRow,
	type SheetsWriteConfig
} from '../src/lib/server/shopee/google-sheets-writer.ts';
import {
	PublishInputError,
	validatePublishSelections
} from '../src/lib/server/shopee/sheet-publish.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const config: SheetsWriteConfig = {
	spreadsheetId: 'sheet-id',
	sheetName: 'Produtos',
	email: 'svc@example.iam.gserviceaccount.com',
	privateKey: pem
};
const row: SheetRow = {
	id: 'shopee-2-1',
	name: 'Produto',
	category: 'Casa',
	price: 'R$ 10,00',
	previous: '',
	image: 'https://img.example/a.jpg',
	url: 'https://s.shopee.com.br/abc',
	date: '2026-01-01'
};
const HEADER = [
	'id',
	'nome',
	'categoria',
	'preco',
	'preco_anterior',
	'imagem',
	'url',
	'publicado_em'
];

function sheetsFetch(
	existing: string[][],
	updatedRows: number,
	calls: string[] = []
): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push(`${init?.method ?? 'GET'} ${url}`);
		if (url.includes('oauth2')) return Response.json({ access_token: 't' });
		if (url.includes(':append')) return Response.json({ updates: { updatedRows } });
		return Response.json({ values: [HEADER, ...existing] });
	}) as typeof fetch;
}

describe('getSheetsWriteConfig', () => {
	it('lista só nomes das variáveis ausentes', () => {
		const result = getSheetsWriteConfig({});
		assert.equal(result.configured, false);
		if (!result.configured) {
			assert.equal(result.missing.length, 4);
			assert.ok(result.missing.every((name) => name.startsWith('GOOGLE_SHEETS_')));
		}
	});
});

describe('appendRowsToSheet', () => {
	it('adiciona linhas e confirma updatedRows', async () => {
		const calls: string[] = [];
		const result = await appendRowsToSheet(config, [row], sheetsFetch([], 1, calls));
		assert.equal(result.appendedRows, 1);
		assert.ok(calls.some((call) => call.includes('INSERT_ROWS')));
	});

	it('recusa duplicado por id ou URL sem gravar', async () => {
		const calls: string[] = [];
		await assert.rejects(
			appendRowsToSheet(
				config,
				[row],
				sheetsFetch([['x', 'N', 'C', 'P', '', 'I', 'https://s.shopee.com.br/ABC', '']], 1, calls)
			),
			(error) => error instanceof SheetsWriteError && error.code === 'SHEETS_DUPLICATE'
		);
		assert.ok(!calls.some((call) => call.includes(':append')));
	});

	it('falha com cabeçalho divergente', async () => {
		const fetcher = (async (input: RequestInfo | URL) =>
			String(input).includes('oauth2')
				? Response.json({ access_token: 't' })
				: Response.json({ values: [['a', 'b']] })) as typeof fetch;
		await assert.rejects(
			appendRowsToSheet(config, [row], fetcher),
			(error) => error instanceof SheetsWriteError && error.code === 'SHEETS_HEADER_MISMATCH'
		);
	});

	it('sinaliza confirmação incorreta de updatedRows', async () => {
		await assert.rejects(
			appendRowsToSheet(config, [row], sheetsFetch([], 0)),
			(error) => error instanceof SheetsWriteError && error.code === 'SHEETS_WRITE_UNCONFIRMED'
		);
	});
});

describe('validatePublishSelections', () => {
	it('valida quantidade e identificadores', () => {
		assert.throws(() => validatePublishSelections([]), PublishInputError);
		const many = Array.from({ length: 11 }, (_, i) => ({
			itemId: String(i + 1),
			shopId: '2',
			category: 'Casa'
		}));
		assert.throws(() => validatePublishSelections(many), PublishInputError);
		assert.throws(
			() => validatePublishSelections([{ itemId: 'abc', shopId: '2', category: 'Casa' }]),
			PublishInputError
		);
		assert.equal(
			validatePublishSelections([{ itemId: '1', shopId: '2', category: ' Casa ' }])[0].category,
			'Casa'
		);
	});
});

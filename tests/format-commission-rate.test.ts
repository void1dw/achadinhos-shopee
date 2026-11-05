import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCommissionRate } from '../src/lib/format.ts';

test('converte fração decimal da Shopee em percentual', () => {
	assert.equal(formatCommissionRate('0.03'), '3%');
	assert.equal(formatCommissionRate('0.06'), '6%');
	assert.equal(formatCommissionRate('0.11'), '11%');
	assert.equal(formatCommissionRate('0.18'), '18%');
	assert.equal(formatCommissionRate(0.03), '3%');
	assert.equal(formatCommissionRate('0.075'), '7,5%');
	assert.equal(formatCommissionRate('0'), '0%');
});

test('retorna null para ausente, vazio e inválido, sem NaN', () => {
	for (const value of [null, undefined, '', '   ', 'abc', 'NaN', 'Infinity', '-0.1', NaN]) {
		assert.equal(formatCommissionRate(value), null);
	}
});

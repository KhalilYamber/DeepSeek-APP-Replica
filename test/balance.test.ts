import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatMoney, pickBalance, type UserBalance } from '../src/services/balance.ts'

test('优先取人民币', () => {
  const balance: UserBalance = {
    is_available: true,
    balance_infos: [
      { currency: 'USD', total_balance: '1.00' },
      { currency: 'CNY', total_balance: '2.00' },
    ],
  }
  assert.equal(pickBalance(balance)?.currency, 'CNY')
})

test('没有人民币时取第一条', () => {
  const balance: UserBalance = {
    is_available: true,
    balance_infos: [{ currency: 'USD', total_balance: '1.00' }],
  }
  assert.equal(pickBalance(balance)?.currency, 'USD')
})

test('空数组与 null 返回 null', () => {
  assert.equal(pickBalance(null), null)
  assert.equal(pickBalance({ is_available: false, balance_infos: [] }), null)
})

test('格式化：人民币、美元、其他币种', () => {
  assert.equal(formatMoney({ currency: 'CNY', total_balance: '12.3' }), '¥12.30')
  assert.equal(formatMoney({ currency: 'USD', total_balance: '5' }), '$5.00')
  assert.equal(formatMoney({ currency: 'EUR', total_balance: '5' }), '5.00')
})

test('金额解析不出来时带上符号原样显示', () => {
  assert.equal(formatMoney({ currency: 'CNY', total_balance: 'abc' }), '¥abc')
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractVerificationUrl,
  parseJsonObject,
  parseJsonValue,
  redactSecrets,
  splitArgs,
  stripAnsi,
  tailText,
} from '../lib/cli.js'

test('splitArgs handles quotes, escapes and Windows paths', () => {
  assert.deepEqual(splitArgs('calendar +agenda'), ['calendar', '+agenda'])
  assert.deepEqual(splitArgs('docs +create --content "hello world"'), [
    'docs',
    '+create',
    '--content',
    'hello world',
  ])
  assert.deepEqual(splitArgs("--text '你好 世界'"), ['--text', '你好 世界'])
  assert.deepEqual(splitArgs('--file C:\\Users\\Patrick\\a.txt'), ['--file', 'C:\\Users\\Patrick\\a.txt'])
  assert.deepEqual(splitArgs('  a   b  '), ['a', 'b'])
  assert.deepEqual(splitArgs(''), [])
})

test('extractVerificationUrl prefers user_code URLs and strips ANSI/punctuation', () => {
  const text = [
    '\u001b[32m打开以下链接配置应用:\u001b[0m',
    'https://open.feishu.cn/page/cli?user_code=ABCD-EFGH&lpv=1.0.98',
    'another https://example.com/x.',
  ].join('\n')
  assert.equal(
    extractVerificationUrl(text),
    'https://open.feishu.cn/page/cli?user_code=ABCD-EFGH&lpv=1.0.98',
  )
  assert.equal(extractVerificationUrl('no url here'), null)
})

test('stripAnsi removes CSI and OSC sequences', () => {
  assert.equal(stripAnsi('\u001b[31mred\u001b[0m'), 'red')
  assert.equal(stripAnsi('\u001b]0;title\u0007text'), 'text')
})

test('parseJsonObject reads the last JSON object from mixed output', () => {
  const text = [
    'some log line',
    '{"ok":true,"appId":"cli_x"}',
    'trailing line',
  ].join('\n')
  assert.deepEqual(parseJsonObject(text), { ok: true, appId: 'cli_x' })
  assert.equal(parseJsonObject('not json'), null)
})

test('parseJsonValue parses plain JSON and scans mixed output', () => {
  assert.deepEqual(parseJsonValue('{"a":1}'), { a: 1 })
  assert.deepEqual(parseJsonValue('[{"a":1}]'), [{ a: 1 }])
  assert.equal(parseJsonValue('nope'), null)
})

test('redactSecrets masks obvious secrets', () => {
  const input = 'app_secret=abcdef123456 token="t-1234567890" AKIAABCDEFGHIJKLMNOP'
  const output = redactSecrets(input)
  assert.ok(!output.includes('abcdef123456'))
  assert.ok(!output.includes('t-1234567890'))
  assert.ok(!output.includes('AKIAABCDEFGHIJKLMNOP'))
})

test('tailText keeps the tail and respects the limit', () => {
  assert.equal(tailText('abcdefghij', 4), '…ghij')
  assert.equal(tailText('abc', 10), 'abc')
})

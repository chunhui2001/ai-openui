import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../src/ai-playground/ai-playground.css', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/ai-playground/ui.ts', import.meta.url), 'utf8')

test('code line selection keeps the line-number gutter transparent', () => {
  assert.match(css, /\.content pre\.shiki \.line\s*\{[^}]*user-select:\s*text;/s)
  assert.match(
    css,
    /\.content pre\.shiki \.line-content\s*\{[^}]*display:\s*block;[^}]*user-select:\s*text;/s,
  )
  assert.match(css, /\.content pre\.shiki \*::selection\s*\{[^}]*background:\s*transparent;/s)
  assert.doesNotMatch(ui, /className\s*=\s*['"]line-number['"]/)
})

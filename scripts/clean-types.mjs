import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2] ?? 'src/lib/api/schema.d.ts'
const source = readFileSync(file, 'utf8')
writeFileSync(file, source.replace(/^\s*\/\*\*[\s\S]*?\*\/\n/gm, ''))

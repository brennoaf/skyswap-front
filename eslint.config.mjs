import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { rules: { 'no-console': 'error' } },
  { ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/lib/sky/web/**', 'src/lib/sky/sci/**', 'public/sw.js', 'playwright-report/**', 'test-results/**'] },
]

export default eslintConfig

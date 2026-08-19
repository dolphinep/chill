import tseslint from 'typescript-eslint'

// Pure TypeScript, no React and no Next — this package is imported by both the
// browser engine and (from v0.2) the Colyseus server, so it must stay portable.
export default tseslint.config({ ignores: ['dist/**'] }, ...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  },
})

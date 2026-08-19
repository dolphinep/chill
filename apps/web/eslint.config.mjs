// eslint-config-next 16 ships native flat config, so no FlatCompat shim is needed
// (routing it through FlatCompat hits a circular-reference crash in the validator).
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescriptConfig from 'eslint-config-next/typescript'

export default [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // React Compiler does memoization. Hand-written memo hooks fight it.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useMemo']",
          message:
            'React Compiler handles memoization. For stable identity use useState(() => …) or useRef.',
        },
        {
          selector: "CallExpression[callee.name='useCallback']",
          message: 'React Compiler handles memoization — remove useCallback.',
        },
      ],
    },
  },
  {
    // The migration seam. If R3F v10 ever stabilises, swapping in a reconciler is a
    // one-file change *because* nothing under engine/ knows React exists. This rule
    // is what keeps that true.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'engine/ must stay framework-free — talk to React via EngineEventBus.',
            },
            { name: 'react-dom', message: 'engine/ must stay framework-free.' },
            { name: 'next', message: 'engine/ must stay framework-free.' },
            {
              name: 'zustand',
              message: 'engine/ owns its own state; do not reach into React stores.',
            },
          ],
          patterns: [
            { group: ['next/*'], message: 'engine/ must stay framework-free.' },
            { group: ['@/components/*'], message: 'engine/ must not import UI components.' },
            { group: ['@/services/*'], message: 'engine/ must not import React services.' },
            { group: ['react-*'], message: 'engine/ must stay framework-free.' },
          ],
        },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
]

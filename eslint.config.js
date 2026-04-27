import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin
    },
    rules: {
      '@firebase/security-rules/no-unprotected-rules': 'error',
      '@firebase/security-rules/no-non-bool-in-condition': 'error'
    }
  }
]

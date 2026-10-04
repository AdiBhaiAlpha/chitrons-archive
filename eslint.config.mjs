import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'backend/**/*', 'js/**/*', 'scripts/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];

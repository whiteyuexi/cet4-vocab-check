// ESLint 扁平配置。项目是 ES5 + 浏览器全局，不用打包器，所以规则只挑"真能抓错"的几条，
// 不做风格检查（风格由 CSS 令牌和既有约定保证，交给 ESLint 只会制造噪音）。
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script'
    },
    rules: {
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'warn',
      'no-func-assign': 'error',
      'no-self-assign': 'warn',
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  }
];

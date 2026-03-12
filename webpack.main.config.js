const path = require('path');

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './apps/electron/src/main/index.js',
  devtool: 'source-map',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@electron': path.resolve(__dirname, 'apps/electron/src'),
      '@web-mobile': path.resolve(__dirname, 'apps/web-mobile/src'),
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@client': path.resolve(__dirname, 'packages/shared/src/client'),
      '@platform': path.resolve(__dirname, 'packages/shared/src/platform'),
      '@test-support': path.resolve(__dirname, 'tooling/test-support'),
    },
  },
};

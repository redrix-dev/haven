const { createWebpackRules } = require('./webpack.rules');
const { sharedResolve } = require('./webpack.shared.config');

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './apps/electron/src/main/index.js',
  devtool: 'source-map',
  // Put your normal webpack config below here
  module: {
    rules: createWebpackRules('tsconfig.node.json'),
  },
  resolve: sharedResolve,
};

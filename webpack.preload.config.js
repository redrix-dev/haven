const { createRendererBundleConfig } = require('./webpack.shared.config');

module.exports = createRendererBundleConfig('tsconfig.node.json');

const path = require("path");

const notificationAudioDir = path.resolve(
  __dirname,
  "packages/shared/src/assets/audio/notifications",
);
const voiceAudioDir = path.resolve(
  __dirname,
  "packages/shared/src/assets/audio/voice",
);

module.exports = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },

  {
    test: /\.tsx?$/,
    exclude: /node_modules/,
    use: {
      loader: "ts-loader",
    },
  },

  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },

  {
    test: /\.(mp3|wav|ogg)$/i,
    type: "asset/resource",
    include: [notificationAudioDir],
    generator: {
      filename: "assets/audio/notifications/[name][ext]",
    },
  },

  {
    test: /\.(mp3|wav|ogg)$/i,
    type: "asset/resource",
    include: [voiceAudioDir],
    generator: {
      filename: "assets/audio/voice/[name][ext]",
    },
  },

  {
    test: /\.(mp3|wav|ogg)$/i,
    type: "asset/resource",
    exclude: [notificationAudioDir, voiceAudioDir],
    generator: {
      filename: "assets/audio/[name][ext]",
    },
  },

  // CSS processing with PostCSS
  {
    test: /\.css$/,
    use: [
      { loader: "style-loader" },
      { loader: "css-loader" },
      { loader: "postcss-loader" },
    ],
  },
];

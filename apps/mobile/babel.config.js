const path = require("path");

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [["babel-preset-expo"]],

    plugins: [
      [
        "module-resolver",
        {
          root: [path.resolve(__dirname)],
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
          alias: {
            "@shared/app/ui": path.resolve(
              __dirname,
              "../../packages/web-client/src/app-ui",
            ),
            "@shared": path.resolve(__dirname, "../../packages/shared/src"),
            "@react-bindings": path.resolve(
              __dirname,
              "../../packages/react-bindings/src",
            ),
            "@platform": path.resolve(
              __dirname,
              "../../packages/shared/src/platform",
            ),
            "@client/app": path.resolve(
              __dirname,
              "../../packages/shared/src/app",
            ),
            "@": path.resolve(__dirname, "./src"),
          },
        },
      ],
      "react-native-worklets/plugin",
    ],
  };
};

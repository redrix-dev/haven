const fs = require("fs");
const path = require("path");

const sharedGlobalsPath = path.resolve(
  __dirname,
  "../../packages/shared/src/styles/globals.css",
);

const parseSharedColorTokens = () => {
  try {
    const source = fs.readFileSync(sharedGlobalsPath, "utf8");
    const tokens = {};
    const tokenPattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let match = tokenPattern.exec(source);
    while (match) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      if (key && value && value.startsWith("#")) {
        tokens[key] = value;
      }
      match = tokenPattern.exec(source);
    }
    return tokens;
  } catch {
    return {};
  }
};

const sharedColors = parseSharedColorTokens();

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/shared/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ...sharedColors,
      },
    },
  },
  plugins: [],
};

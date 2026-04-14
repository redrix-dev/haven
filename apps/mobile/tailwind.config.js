/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: '#0f1728',
        foreground: '#e6edf7',
        card: '#16233a',
        'card-foreground': '#e6edf7',
        primary: '#3f79d8',
        'primary-foreground': '#f4f8ff',
        secondary: '#22324d',
        'secondary-foreground': '#e6edf7',
        muted: '#1d2a42',
        'muted-foreground': '#a9b8cf',
        accent: '#2a3d5d',
        'accent-foreground': '#e6edf7',
        destructive: '#b74a56',
        'destructive-foreground': '#fff1f3',
        border: '#304867',
        input: '#304867',
        ring: '#5f8fdd',
        sidebar: '#121d31',
      },
    },
  },
  plugins: [],
};

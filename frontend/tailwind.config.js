/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark:    '#050d1a',
        surface: '#0a1628',
        card:    '#0f1f38',
        border:  '#1a2f4a',
        accent:  '#00d4ff',
        green:   '#00ff88',
        red:     '#ff3b5c',
        yellow:  '#ffc940',
        purple:  '#7c3aed',
      },
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] }
    }
  },
  plugins: []
}

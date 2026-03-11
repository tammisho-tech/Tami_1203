import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Rubik"', '"Arial"', 'sans-serif'],
        hebrew: ['"Rubik"', '"Arial"', 'sans-serif'],
      },
      colors: {
        rama: {
          teal:   '#00B5CC',
          blue:   '#1565C0',
          indigo: '#2D3EA0',
          deep:   '#1A2D7A',
          light:  '#E8F4FD',
        },
        dim: {
          A: '#dbeafe',
          B: '#dcfce7',
          C: '#fef9c3',
          D: '#fce7f3',
        },
        'dim-text': {
          A: '#1e40af',
          B: '#166534',
          C: '#854d0e',
          D: '#9d174d',
        },
      },
    },
  },
  plugins: [],
} satisfies Config

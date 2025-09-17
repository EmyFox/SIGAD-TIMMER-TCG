/**** Tailwind + DaisyUI config ****/ 
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './display.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3ABEF9',
        secondary: '#F8D210',
        accent: '#FF6F91',
        neutral: '#1E293B',
        info: '#3ABEF9',
        success: '#16A34A',
        warning: '#F59E0B',
        error: '#DC2626',
        base: {
          100: '#0F172A',
          200: '#162132',
          300: '#1E293B'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        card: '0 4px 16px -4px rgba(0,0,0,0.4)'
      }
    }
  },
  plugins: []
};

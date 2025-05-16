/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        'brand-green': '#4CAF50',
        'brand-brown': '#795548',
      },
      spacing: {
        '128': '32rem', // Example custom spacing
      },
      fontSize: {
        'xxs': '0.65rem',
      }
    },
  },
  plugins: [],
}
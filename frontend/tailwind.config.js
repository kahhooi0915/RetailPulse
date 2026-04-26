export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
       keyframes: {
    slideIn: {
      "0%": { opacity: "0", transform: "translateY(-20px) scale(0.95)" },
      "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
    },
  },
  animation: {
    "slide-in": "slideIn 0.4s ease-out",
  },
    },
  },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  safelist: [
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-blue-500",
    "bg-amber-100",
    "text-amber-800",
    "bg-blue-100",
    "text-blue-800",
    "bg-green-100",
    "text-green-800",
    "bg-red-100",
    "text-red-800",
    "bg-emerald-100",
    "text-emerald-800",
    "bg-purple-50",
    "text-purple-900",
    "border-purple-200",
    "bg-red-50",
    "text-red-700",
    "text-red-600",
    "border-red-200",
    "hover:bg-red-100",
    "bg-emerald-50",
    "text-emerald-700",
    "text-emerald-600",
    "border-emerald-200",
    "hover:bg-emerald-100",
    "bg-amber-50",
    "text-amber-700",
    "text-amber-600",
    "border-amber-200",
    "hover:bg-amber-100",
    "hidden",
    "inline-flex",
    "flex",
    "is-visible",
    "is-loaded",
    "is-missing",
    "is-loading",
    "is-active"
  ],
  theme: {
    extend: {
      screens: {
        xs: "480px"
      },
      colors: {
        primary: "#2563EB",
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#DC2626",
        surface: "#F8FAFC"
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 8px 30px rgba(15, 23, 42, 0.06)",
        card: "0 4px 20px rgba(15, 23, 42, 0.05)",
        press: "0 2px 8px rgba(15, 23, 42, 0.08)"
      },
      minHeight: {
        touch: "48px"
      }
    }
  },
  plugins: []
};

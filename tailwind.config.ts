import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          ...colors.zinc,
          950: "#000000",
          900: "#000000",
          850: "#08080a",
          800: "#121215",
          750: "#18181c",
          700: "#27272a",
        },
        zinc: {
          ...colors.zinc,
          950: "#000000",
          900: "#000000",
          850: "#08080a",
          800: "#121215",
          750: "#18181c",
          700: "#27272a",
        },
        slate: {
          ...colors.zinc,
          950: "#000000",
          900: "#000000",
          850: "#08080a",
          800: "#121215",
          750: "#18181c",
          700: "#27272a",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        navy: {
          50: "#f0f4f9",
          100: "#d9e2ec",
          200: "#bcccdc",
          300: "#9fb3c8",
          400: "#829ab1",
          500: "#627d98",
          600: "#486581",
          700: "#334e68",
          800: "#1e3a5f",
          900: "#0b192c",
          950: "#060e1a",
        },
        transit: {
          blue: "#1d4ed8",
          sky: "#0284c7",
          teal: "#0d9488",
          emerald: "#059669",
          amber: "#d97706",
          rose: "#e11d48",
          purple: "#7c3aed",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      // Sizes used across the app that Tailwind 3 does not ship by default.
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
      boxShadow: {
        "2xs": "0 1px 1px 0 rgb(0 0 0 / 0.04)",
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
      borderRadius: {
        lg: "hsl(var(--radius))",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "bus-glide": {
          "0%": { transform: "translateX(-10px)" },
          "50%": { transform: "translateX(10px)" },
          "100%": { transform: "translateX(-10px)" },
        },
      },
      animation: {
        "pulse-subtle": "pulse-subtle 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bus-glide": "bus-glide 3s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;

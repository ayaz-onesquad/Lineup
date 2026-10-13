/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Driven by CSS variables so both themes are covered and the
        // `/opacity` modifier works. Previously hard-coded hexes with no dark
        // variant. See docs/DESIGN-SYSTEM.md section 2.5.
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        carbon: {
          'gray-10': '#f4f4f4',  // Page backgrounds
          'gray-20': '#e0e0e0',  // Borders, dividers
          'gray-30': '#c6c6c6',  // Disabled backgrounds
          'gray-60': '#6f6f6f',  // Secondary text
          'gray-100': '#161616', // Primary text
          'blue-60': '#0f62fe',  // Primary action
          'blue-70': '#0043ce',  // Primary hover
          'white': '#ffffff',    // Card backgrounds
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      // ---------------------------------------------------------------------
      // Design system tokens — see docs/DESIGN-SYSTEM.md
      //
      // Breakpoints are deliberately left at the Tailwind defaults
      // (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536). `md` is the single
      // structural breakpoint: tables below it become cards. Do not add custom
      // breakpoints; a second switch point for the same decision makes resize
      // behaviour unpredictable.
      // ---------------------------------------------------------------------

      spacing: {
        // Bottom inset on notched devices. Any element docked to the bottom of
        // the viewport must add `pb-safe` or it sits under the home indicator.
        safe: "env(safe-area-inset-bottom)",
      },

      height: {
        // Table row densities (section 2.6). Set once per view, never mixed.
        "row-compact": "2.75rem",      // 44px — dense operational grids
        "row-comfortable": "3.5rem",   // 56px — default
        "row-spacious": "4rem",        // 64px — avatar + two lines
      },

      minHeight: {
        // Touch targets (section 2.4). Apple HIG 44pt / Material 48dp.
        touch: "2.75rem",        // 44px — row actions, icon buttons, tabs
        "touch-lg": "3rem",      // 48px — primary buttons, form controls
      },

      minWidth: {
        touch: "2.75rem",
        "touch-lg": "3rem",
      },

      maxWidth: {
        // Caps line length on very wide displays so a data grid does not
        // stretch a 7-column table across 2560px.
        content: "1600px",
      },

      boxShadow: {
        // Affordance on a horizontally scrollable table edge, so wide data
        // reads as scrollable rather than silently clipped (section 4.4).
        "scroll-right": "inset -12px 0 12px -12px hsl(var(--foreground) / 0.12)",
        "scroll-left": "inset 12px 0 12px -12px hsl(var(--foreground) / 0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),

    // `coarse:` applies only on touch input, regardless of viewport width.
    // This is how touch targets reach 44px on a phone or a touchscreen laptop
    // without inflating every button on a mouse-driven desktop. Sizing by
    // breakpoint instead would miss a 1024px tablet.
    function ({ addVariant }) {
      addVariant("coarse", "@media (pointer: coarse)")
      addVariant("fine", "@media (pointer: fine)")
    },
  ],
}

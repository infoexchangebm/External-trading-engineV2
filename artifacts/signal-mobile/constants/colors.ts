/**
 * Design tokens — dark trading terminal theme.
 * Mirrored from trading-engine index.css .dark variables (HSL → hex).
 */
const colors = {
  dark: {
    // Legacy aliases
    text: '#f5f8fa',
    tint: '#3b82f6',

    // Core surfaces
    background: '#0e141f',
    foreground: '#f5f8fa',

    // Cards / elevated surfaces
    card: '#131c30',
    cardForeground: '#f5f8fa',
    cardBorder: '#252f42',

    // Primary (blue)
    primary: '#3b82f6',
    primaryForeground: '#f5f8fa',

    // Secondary
    secondary: '#1a2438',
    secondaryForeground: '#f5f8fa',

    // Muted
    muted: '#1a2438',
    mutedForeground: '#6b7a99',

    // Accent
    accent: '#252f42',
    accentForeground: '#f5f8fa',

    // Semantic
    success: '#22c55e',
    successForeground: '#f5f8fa',
    destructive: '#ef4444',
    destructiveForeground: '#f5f8fa',
    warning: '#f59e0b',
    warningForeground: '#0e141f',

    // Borders / inputs
    border: '#252f42',
    input: '#1a2438',

    // Chart colors
    chart1: '#3b82f6',
    chart2: '#22c55e',
    chart3: '#f59e0b',
    chart4: '#a855f7',
    chart5: '#ef4444',
  },
  radius: 10,
};

export type ColorTokens = typeof colors.dark;
export default colors;

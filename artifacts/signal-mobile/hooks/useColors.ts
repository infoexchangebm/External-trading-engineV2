import colors, { ColorTokens } from '@/constants/colors';

/**
 * Always returns the dark palette — this is a trading terminal,
 * dark mode only. No system preference check needed.
 */
export function useColors(): ColorTokens {
  return colors.dark;
}

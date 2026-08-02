import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Signal = 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' | string;

interface SignalBadgeProps {
  signal: Signal;
  size?: 'sm' | 'md' | 'lg';
}

export function SignalBadge({ signal, size = 'md' }: SignalBadgeProps) {
  const colors = useColors();

  const upper = signal?.toUpperCase() ?? 'NEUTRAL';

  const bg =
    upper === 'BUY' || upper === 'BULLISH'
      ? '#16402a'
      : upper === 'SELL' || upper === 'BEARISH'
      ? '#3f1212'
      : '#1e2435';

  const fg =
    upper === 'BUY' || upper === 'BULLISH'
      ? colors.success
      : upper === 'SELL' || upper === 'BEARISH'
      ? colors.destructive
      : colors.mutedForeground;

  const fontSize = size === 'sm' ? 9 : size === 'lg' ? 13 : 11;
  const px = size === 'sm' ? 6 : size === 'lg' ? 10 : 8;
  const py = size === 'sm' ? 2 : size === 'lg' ? 4 : 3;

  return (
    <View style={[styles.badge, { backgroundColor: bg, paddingHorizontal: px, paddingVertical: py }]}>
      <Text style={[styles.text, { color: fg, fontSize }]}>{upper}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

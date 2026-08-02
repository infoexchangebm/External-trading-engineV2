import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'success' | 'danger' | 'warning' | 'primary';
  style?: ViewStyle;
}

export function MetricCard({ label, value, sub, accent = 'default', style }: MetricCardProps) {
  const colors = useColors();

  const valueColor =
    accent === 'success' ? colors.success
    : accent === 'danger'  ? colors.destructive
    : accent === 'warning' ? colors.warning
    : accent === 'primary' ? colors.primary
    : colors.foreground;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {sub ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 11,
    marginTop: 4,
  },
});

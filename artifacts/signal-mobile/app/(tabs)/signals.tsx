import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { SignalBadge } from '@/components/SignalBadge';
import {
  useListSignals,
  useGenerateSignal,
} from '@workspace/api-client-react';

export default function SignalsScreen() {
  const colors = useColors();
  const [symbol, setSymbol] = useState('');
  const [filterSignal, setFilterSignal] = useState<string | null>(null);

  const { data: signals, isLoading, refetch, isRefetching } = useListSignals();
  const { mutate: generate, isPending } = useGenerateSignal({
    mutation: {
      onSuccess: () => {
        setSymbol('');
        refetch();
      },
      onError: (err: any) => {
        Alert.alert('Error', err?.message ?? 'Failed to generate signal');
      },
    },
  });

  const filtered = signals
    ? signals.filter((s: any) =>
        filterSignal ? s.finalSignal?.toUpperCase() === filterSignal : true
      )
    : [];

  function handleGenerate() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      Alert.alert('Enter a symbol', 'e.g. AAPL');
      return;
    }
    generate({ data: { symbol: sym } });
  }

  const filters = ['BUY', 'SELL', 'HOLD'];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0d1b35', '#0e141f']} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <Text style={styles.title}>Quant Signals</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {signals?.length ?? 0} recorded
            </Text>
          </View>

          {/* Generate row */}
          <View style={styles.generateRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Symbol (e.g. AAPL, BTCUSD)"
              placeholderTextColor={colors.mutedForeground}
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.genBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.6 : 1 }]}
              onPress={handleGenerate}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name="zap" size={18} color="#fff" />
              )}
            </Pressable>
          </View>

          {/* Filter chips */}
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, !filterSignal && { backgroundColor: colors.primary }]}
              onPress={() => setFilterSignal(null)}
            >
              <Text style={[styles.chipText, { color: !filterSignal ? '#fff' : colors.mutedForeground }]}>All</Text>
            </Pressable>
            {filters.map(f => (
              <Pressable
                key={f}
                style={[styles.chip, filterSignal === f && { backgroundColor: colors.primary }]}
                onPress={() => setFilterSignal(filterSignal === f ? null : f)}
              >
                <Text style={[styles.chipText, { color: filterSignal === f ? '#fff' : colors.mutedForeground }]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="activity" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No signals recorded yet</Text>
            </View>
          }
          renderItem={({ item }) => <SignalCard signal={item} colors={colors} />}
        />
      )}
    </View>
  );
}

function SignalCard({ signal, colors }: { signal: any; colors: any }) {
  const subSignals = [
    { label: 'Macro', value: signal.macroSignal },
    { label: 'Orderbook', value: signal.orderbookSignal },
    { label: 'Earnings', value: signal.earningsSignal },
    { label: 'Technical', value: signal.technicalSignal },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardSymbol, { color: colors.foreground }]}>{signal.symbol}</Text>
          <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>
            {signal.createdAt ? new Date(signal.createdAt).toLocaleString() : ''}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <SignalBadge signal={signal.finalSignal} size="md" />
          <Text style={[styles.cardConf, { color: colors.primary }]}>
            {signal.confidence != null ? `${(signal.confidence * 100).toFixed(1)}%` : ''}
          </Text>
        </View>
      </View>
      {signal.stopLoss && signal.takeProfit && (
        <View style={styles.targetsRow}>
          <Text style={styles.targetSl}>SL: {signal.stopLoss}</Text>
          <Text style={styles.targetTp}>TP: {signal.takeProfit}</Text>
        </View>
      )}
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <View style={styles.subGrid}>
        {subSignals.map(s => (
          <View key={s.label} style={styles.subItem}>
            <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            <SignalBadge signal={s.value ?? 'N/A'} size="sm" />
          </View>
        ))}
      </View>
      {signal.score != null && (
        <View style={styles.scoreBar}>
          <View style={[styles.scoreFill, {
            width: `${Math.min(100, Math.abs(signal.score) * 100)}%`,
            backgroundColor: signal.score >= 0 ? colors.success : colors.destructive,
          }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: { paddingHorizontal: 20, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  sub: { fontSize: 12 },
  generateRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 10 },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  genBtn: {
    width: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chips: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1a2438',
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14 },
  cardSymbol: { fontSize: 16, fontWeight: '800' },
  cardTime: { fontSize: 11, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardConf: { fontSize: 13, fontWeight: '700' },
  targetsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  targetSl: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  targetTp: { fontSize: 12, fontWeight: '700', color: '#10b981' },
  cardDivider: { height: 1 },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 10 },
  subItem: { width: '45%', gap: 4 },
  subLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  scoreBar: {
    height: 3,
    backgroundColor: '#1a2438',
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreFill: { height: '100%', borderRadius: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14 },
});

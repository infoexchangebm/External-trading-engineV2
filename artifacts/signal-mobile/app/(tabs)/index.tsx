import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { MetricCard } from '@/components/MetricCard';
import { SignalBadge } from '@/components/SignalBadge';
import { SectionHeader } from '@/components/SectionHeader';
import {
  useGetSignalSummary,
  useGetMacroData,
  useGetOrderbook,
  useHealthCheck,
} from '@workspace/api-client-react';

export default function DashboardScreen() {
  const colors = useColors();

  const { data: health } = useHealthCheck({ query: { refetchInterval: 30_000 } });
  const {
    data: summary,
    isLoading: sumLoading,
    refetch: refetchSummary,
    isRefetching,
  } = useGetSignalSummary();
  const { data: macro } = useGetMacroData();
  const { data: orderbook } = useGetOrderbook();

  const isOnline = health?.status === 'ok';

  function onRefresh() {
    refetchSummary();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Hero header */}
      <LinearGradient
        colors={['#0d1b35', '#0e141f']}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <View>
              <Text style={styles.appName}>ENGINE COCKPIT</Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                Signal Monitor
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.destructive }]} />
              <Text style={[styles.statusText, { color: isOnline ? colors.success : colors.destructive }]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Summary metrics */}
        <SectionHeader title="Overview" subtitle="Signal performance summary" style={styles.section} />
        {sumLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <View style={styles.row}>
              <MetricCard
                label="Total Signals"
                value={summary?.totalSignals ?? '—'}
                style={styles.halfCard}
              />
              <View style={styles.gap} />
              <MetricCard
                label="Avg Confidence"
                value={summary?.avgConfidence != null ? `${(summary.avgConfidence * 100).toFixed(1)}%` : '—'}
                accent="primary"
                style={styles.halfCard}
              />
            </View>
            <View style={[styles.row, { marginTop: 10 }]}>
              <MetricCard
                label="Buy Signals"
                value={summary?.buyCount ?? '—'}
                accent="success"
                style={styles.halfCard}
              />
              <View style={styles.gap} />
              <MetricCard
                label="Sell Signals"
                value={summary?.sellCount ?? '—'}
                accent="danger"
                style={styles.halfCard}
              />
            </View>
          </>
        )}

        {/* Recent signals */}
        {summary?.recentSignals && summary.recentSignals.length > 0 && (
          <>
            <SectionHeader title="Recent Signals" style={[styles.section, { marginTop: 24 }]} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {summary.recentSignals.slice(0, 6).map((sig: any, i: number) => (
                <View
                  key={sig.id}
                  style={[
                    styles.sigRow,
                    i < summary.recentSignals.slice(0, 6).length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.sigLeft}>
                    <Text style={[styles.symbol, { color: colors.foreground }]}>{sig.symbol}</Text>
                    <Text style={[styles.sigTime, { color: colors.mutedForeground }]}>
                      {sig.createdAt ? new Date(sig.createdAt).toLocaleTimeString() : ''}
                    </Text>
                  </View>
                  <View style={styles.sigRight}>
                    <SignalBadge signal={sig.finalSignal} size="sm" />
                    <Text style={[styles.conf, { color: colors.mutedForeground }]}>
                      {sig.confidence != null ? `${(sig.confidence * 100).toFixed(0)}%` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Macro climate */}
        {macro && (
          <>
            <SectionHeader title="Macro Climate" style={[styles.section, { marginTop: 24 }]} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MacroRow label="Fed Stance" value={macro.fedStance} colors={colors} />
              <MacroRow label="VIX" value={macro.vix != null ? macro.vix.toFixed(2) : 'N/A'} colors={colors} border />
              <MacroRow label="Inflation" value={macro.inflation != null ? `${macro.inflation.toFixed(2)}%` : 'N/A'} colors={colors} border />
              <MacroRow label="GDP Growth" value={macro.gdpGrowth != null ? `${macro.gdpGrowth.toFixed(2)}%` : 'N/A'} colors={colors} border last />
            </View>
          </>
        )}

        {/* Orderbook imbalance */}
        {orderbook && Array.isArray(orderbook) && orderbook.length > 0 && (
          <>
            <SectionHeader title="Orderbook Imbalance" style={[styles.section, { marginTop: 24 }]} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {orderbook.slice(0, 5).map((ob: any, i: number) => (
                <View
                  key={ob.symbol}
                  style={[
                    styles.obRow,
                    i < orderbook.slice(0, 5).length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.obSymbol, { color: colors.foreground }]}>{ob.symbol}</Text>
                  <View style={styles.obBar}>
                    <View
                      style={[
                        styles.obFill,
                        {
                          width: `${Math.min(100, Math.abs(ob.imbalance ?? 0) * 100)}%`,
                          backgroundColor:
                            (ob.imbalance ?? 0) > 0 ? colors.success : colors.destructive,
                        },
                      ]}
                    />
                  </View>
                  <SignalBadge signal={ob.signal ?? 'NEUTRAL'} size="sm" />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MacroRow({
  label,
  value,
  colors,
  border,
  last,
}: {
  label: string;
  value: string;
  colors: any;
  border?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.macroRow,
        border && { borderTopWidth: 1, borderTopColor: colors.border },
      ]}
    >
      <Text style={[styles.macroLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
  },
  headerSub: { fontSize: 12, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  section: {},
  row: { flexDirection: 'row' },
  gap: { width: 10 },
  halfCard: {},
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sigLeft: {},
  sigRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: { fontSize: 14, fontWeight: '700' },
  sigTime: { fontSize: 11, marginTop: 2 },
  conf: { fontSize: 12 },
  obRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  obSymbol: { width: 68, fontSize: 13, fontWeight: '600' },
  obBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#1a2438',
    borderRadius: 3,
    overflow: 'hidden',
  },
  obFill: { height: '100%', borderRadius: 3 },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  macroLabel: { fontSize: 13 },
  macroValue: { fontSize: 13, fontWeight: '600' },
});

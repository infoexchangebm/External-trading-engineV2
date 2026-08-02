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
import { SectionHeader } from '@/components/SectionHeader';
import { SignalBadge } from '@/components/SignalBadge';
import {
  useGetOrderbook,
  useGetMacroData,
  useGetEarningsData,
} from '@workspace/api-client-react';

export default function MarketScreen() {
  const colors = useColors();

  const {
    data: orderbook,
    isLoading: obLoading,
    refetch: refetchOb,
    isRefetching: obRefetching,
  } = useGetOrderbook();

  const { data: macro, refetch: refetchMacro } = useGetMacroData();
  const { data: earnings, refetch: refetchEarnings } = useGetEarningsData();

  function onRefresh() {
    refetchOb();
    refetchMacro();
    refetchEarnings();
  }

  const macroRows = macro
    ? [
        { label: 'Fed Stance', value: macro.fedStance ?? 'N/A' },
        { label: 'VIX', value: macro.vix != null ? macro.vix.toFixed(2) : 'N/A' },
        { label: 'Inflation', value: macro.inflation != null ? `${macro.inflation.toFixed(2)}%` : 'N/A' },
        { label: 'CPI', value: macro.cpi != null ? macro.cpi.toFixed(2) : 'N/A' },
        { label: 'GDP Growth', value: macro.gdpGrowth != null ? `${macro.gdpGrowth.toFixed(2)}%` : 'N/A' },
        { label: 'Signal', value: macro.signal ?? 'N/A' },
      ]
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0d1b35', '#0e141f']} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <Text style={styles.title}>Market Data</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Orderbook · Macro · Earnings
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={obRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Orderbook */}
        <SectionHeader title="Orderbook Imbalance" subtitle="Bid/ask depth ratio" style={styles.section} />
        {obLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : orderbook && Array.isArray(orderbook) && orderbook.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {orderbook.map((ob: any, i: number) => {
              const pct = Math.min(100, Math.abs(ob.imbalance ?? 0) * 100);
              const positive = (ob.imbalance ?? 0) >= 0;
              return (
                <View
                  key={ob.symbol}
                  style={[
                    styles.obRow,
                    i < orderbook.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.obSym, { color: colors.foreground }]}>{ob.symbol}</Text>
                  <View style={styles.obBarWrap}>
                    <View style={[styles.obBarBg, { backgroundColor: colors.input }]}>
                      <View
                        style={[
                          styles.obBarFill,
                          { width: `${pct}%`, backgroundColor: positive ? colors.success : colors.destructive },
                        ]}
                      />
                    </View>
                  </View>
                  <SignalBadge signal={ob.signal ?? 'NEUTRAL'} size="sm" />
                  <Text style={[styles.obPct, { color: colors.mutedForeground }]}>
                    {((ob.imbalance ?? 0) * 100).toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 20 }]}>
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>No orderbook data</Text>
          </View>
        )}

        {/* Macro */}
        <SectionHeader title="Macro Climate" subtitle={macro?.lastUpdated ? `Updated: ${new Date(macro.lastUpdated).toLocaleTimeString()}` : undefined} style={[styles.section, { marginTop: 24 }]} />
        {macroRows.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {macroRows.map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.macroRow,
                  i < macroRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.macroLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                {row.label === 'Signal' || row.label === 'Fed Stance' ? (
                  <SignalBadge signal={row.value} size="sm" />
                ) : (
                  <Text style={[styles.macroValue, { color: colors.foreground }]}>{row.value}</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 20 }]}>
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>No macro data — add FRED_API_KEY and ALPHAVANTAGE_API_KEY</Text>
          </View>
        )}

        {/* Earnings */}
        <SectionHeader title="Earnings Calendar" subtitle="Recent surprises & signals" style={[styles.section, { marginTop: 24 }]} />
        {earnings && Array.isArray(earnings) && earnings.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.tableHeader, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={[styles.thCell, { color: colors.mutedForeground, flex: 1 }]}>TICKER</Text>
              <Text style={[styles.thCell, { color: colors.mutedForeground, width: 80 }]}>SURPRISE</Text>
              <Text style={[styles.thCell, { color: colors.mutedForeground, width: 70 }]}>SIGNAL</Text>
            </View>
            {earnings.map((e: any, i: number) => {
              const surprise = e.surprisePercent ?? 0;
              return (
                <View
                  key={e.ticker ?? i}
                  style={[
                    styles.tableRow,
                    i < earnings.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.tdSym, { color: colors.foreground, flex: 1 }]}>{e.ticker}</Text>
                  <Text
                    style={[
                      styles.tdCell,
                      {
                        color: surprise >= 0 ? colors.success : colors.destructive,
                        width: 80,
                      },
                    ]}
                  >
                    {surprise >= 0 ? '+' : ''}{surprise.toFixed(1)}%
                  </Text>
                  <View style={{ width: 70, alignItems: 'flex-start' }}>
                    <SignalBadge signal={e.signal ?? 'NEUTRAL'} size="sm" />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 20 }]}>
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>No earnings data available</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: { paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  section: {},
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  obRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  obSym: { width: 68, fontSize: 13, fontWeight: '700' },
  obBarWrap: { flex: 1 },
  obBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  obBarFill: { height: '100%', borderRadius: 3 },
  obPct: { fontSize: 11, width: 42, textAlign: 'right' },
  macroRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  macroLabel: { fontSize: 13 },
  macroValue: { fontSize: 13, fontWeight: '600' },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  thCell: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  tdSym: { fontSize: 14, fontWeight: '700' },
  tdCell: { fontSize: 13, fontWeight: '600' },
  noData: { fontSize: 13 },
});

import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { SectionHeader } from '@/components/SectionHeader';
import { SignalBadge } from '@/components/SignalBadge';
import {
  useGetScannerNews,
  useGetScannerRvol,
  useGetScannerMomentum,
  useGetScannerOptionsFlow,
} from '@workspace/api-client-react';

export default function ScannerScreen() {
  const colors = useColors();

  const { data: news, isLoading: newsLoading, refetch: refetchNews, isRefetching: newsRefetching } = useGetScannerNews();
  const { data: rvol, refetch: refetchRvol } = useGetScannerRvol();
  const { data: momentum, refetch: refetchMomentum } = useGetScannerMomentum();
  const { data: options, refetch: refetchOptions } = useGetScannerOptionsFlow();

  const isRefreshing = newsRefetching;

  function onRefresh() {
    refetchNews();
    refetchRvol();
    refetchMomentum();
    refetchOptions();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0d1b35', '#0e141f']} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <View>
              <Text style={styles.title}>Scanner</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                News · RVOL · Momentum · Options
              </Text>
            </View>
            <Pressable onPress={onRefresh} style={[styles.scanBtn, { backgroundColor: colors.primary }]}>
              <Feather name="refresh-cw" size={14} color="#fff" />
              <Text style={styles.scanBtnText}>Scan</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* News */}
        <SectionHeader
          title="News & Catalysts"
          subtitle="Finnhub · SEC EDGAR 8-K · FDA — 7-day window"
          style={styles.section}
        />
        {newsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : news && news.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {news.slice(0, 8).map((item: any, i: number) => (
              <Pressable
                key={i}
                onPress={() => item.url && Linking.openURL(item.url)}
                style={[
                  styles.newsItem,
                  i < news.slice(0, 8).length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.newsTop}>
                  <View style={styles.newsTags}>
                    {item.symbol && (
                      <View style={[styles.tag, { backgroundColor: '#1a2c4a' }]}>
                        <Text style={[styles.tagText, { color: colors.primary }]}>{item.symbol}</Text>
                      </View>
                    )}
                    {item.source && (
                      <View style={[styles.tag, { backgroundColor: '#252f42' }]}>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{item.source}</Text>
                      </View>
                    )}
                  </View>
                  {item.url && <Feather name="external-link" size={12} color={colors.mutedForeground} />}
                </View>
                <Text style={[styles.newsHeadline, { color: colors.foreground }]} numberOfLines={2}>
                  {item.headline}
                </Text>
                {item.datetime && (
                  <Text style={[styles.newsTime, { color: colors.mutedForeground }]}>
                    {new Date(item.datetime * 1000).toLocaleDateString()} {new Date(item.datetime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState icon="file-text" message="No news — add FINNHUB_API_KEY for live feed" colors={colors} />
        )}

        {/* RVOL */}
        <SectionHeader title="Relative Volume" subtitle="RVOL ≥ 5× flags unusual activity" style={[styles.section, { marginTop: 24 }]} />
        {rvol && rvol.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {rvol.map((item: any, i: number) => {
              const isUnavailable = item.error;
              const rvolNum = item.rvol ?? 0;
              return (
                <View
                  key={item.symbol}
                  style={[
                    styles.rvolRow,
                    i < rvol.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.rvolSym, { color: colors.foreground }]}>{item.symbol}</Text>
                  {isUnavailable ? (
                    <Text style={[styles.unavailText, { color: colors.mutedForeground }]}>
                      {item.error}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.rvolBarWrap}>
                        <View style={[styles.rvolBarBg, { backgroundColor: colors.input }]}>
                          <View
                            style={[
                              styles.rvolBarFill,
                              {
                                width: `${Math.min(100, (rvolNum / 10) * 100)}%`,
                                backgroundColor: rvolNum >= 5 ? colors.warning : colors.primary,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.rvolNum, { color: rvolNum >= 5 ? colors.warning : colors.foreground }]}>
                        {rvolNum.toFixed(2)}×
                      </Text>
                      {rvolNum >= 5 && (
                        <View style={[styles.hotBadge, { backgroundColor: '#3f2a00' }]}>
                          <Text style={[styles.hotText, { color: colors.warning }]}>HOT</Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="bar-chart-2" message="Add ALPHAVANTAGE_API_KEY for RVOL data" colors={colors} />
        )}

        {/* Momentum */}
        <SectionHeader title="Momentum Screener" subtitle="Price $2–$20 · Change 2–10% · Float < 10M" style={[styles.section, { marginTop: 24 }]} />
        {momentum && momentum.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {momentum.map((item: any, i: number) => (
              <View
                key={item.symbol}
                style={[
                  styles.momRow,
                  i < momentum.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.momSym, { color: colors.foreground }]}>{item.symbol}</Text>
                {item.error ? (
                  <Text style={[styles.unavailText, { color: colors.mutedForeground }]}>{item.error}</Text>
                ) : (
                  <View style={styles.momRight}>
                    <Text style={[styles.momPrice, { color: colors.foreground }]}>
                      ${item.price?.toFixed(2)}
                    </Text>
                    <Text
                      style={[
                        styles.momChange,
                        { color: (item.changePercent ?? 0) >= 0 ? colors.success : colors.destructive },
                      ]}
                    >
                      {(item.changePercent ?? 0) >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                    </Text>
                    {item.float != null && (
                      <Text style={[styles.momFloat, { color: colors.mutedForeground }]}>
                        {(item.float / 1e6).toFixed(1)}M float
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon="trending-up" message="Add ALPHAVANTAGE_API_KEY for momentum data" colors={colors} />
        )}

        {/* Options pressure */}
        <SectionHeader title="Options Pressure" subtitle="Zero-DTE put/call ratio via Polygon.io" style={[styles.section, { marginTop: 24 }]} />
        {options && options.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {options.map((item: any, i: number) => (
              <View
                key={item.symbol}
                style={[
                  styles.optRow,
                  i < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.optSym, { color: colors.foreground }]}>{item.symbol}</Text>
                {item.error ? (
                  <Text style={[styles.unavailText, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.error}
                  </Text>
                ) : (
                  <View style={styles.optRight}>
                    {item.lean && <SignalBadge signal={item.lean} size="sm" />}
                    {item.putCallRatio != null && (
                      <Text style={[styles.optRatio, { color: colors.mutedForeground }]}>
                        P/C {item.putCallRatio.toFixed(2)}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon="layers" message="Add POLYGON_API_KEY for options pressure data" colors={colors} />
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({ icon, message, colors }: { icon: any; message: string; colors: any }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={24} color={colors.mutedForeground} />
      <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 12, marginTop: 2 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  scanBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  section: {},
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  newsItem: { padding: 14 },
  newsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  newsTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  newsHeadline: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  newsTime: { fontSize: 11, marginTop: 4 },
  rvolRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  rvolSym: { width: 68, fontSize: 13, fontWeight: '700' },
  rvolBarWrap: { flex: 1 },
  rvolBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  rvolBarFill: { height: '100%', borderRadius: 3 },
  rvolNum: { fontSize: 13, fontWeight: '700', width: 48, textAlign: 'right' },
  hotBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  hotText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  momRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  momSym: { fontSize: 14, fontWeight: '700' },
  momRight: { alignItems: 'flex-end', gap: 2 },
  momPrice: { fontSize: 14, fontWeight: '700' },
  momChange: { fontSize: 12, fontWeight: '600' },
  momFloat: { fontSize: 11 },
  optRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  optSym: { fontSize: 14, fontWeight: '700' },
  optRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optRatio: { fontSize: 12 },
  unavailText: { fontSize: 11, flex: 1 },
  emptyCard: {
    borderRadius: 14, borderWidth: 1, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  emptyMsg: { fontSize: 13, flex: 1 },
});

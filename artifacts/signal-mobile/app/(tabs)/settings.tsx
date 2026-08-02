import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useColors } from '@/hooks/useColors';
import { SectionHeader } from '@/components/SectionHeader';
import {
  useGetConfig,
  useUpdateConfig,
} from '@workspace/api-client-react';

export default function SettingsScreen() {
  const colors = useColors();

  const { data: config, isLoading } = useGetConfig();
  const { mutate: updateConfig, isPending } = useUpdateConfig({
    mutation: {
      onSuccess: () => Alert.alert('Saved', 'Configuration updated'),
      onError: (err: any) => Alert.alert('Error', err?.message ?? 'Failed to save'),
    },
  });

  const [symbols, setSymbols] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [threshold, setThreshold] = useState(0.6);
  const [macroWeight, setMacroWeight] = useState(0.25);
  const [orderbookWeight, setOrderbookWeight] = useState(0.30);
  const [earningsWeight, setEarningsWeight] = useState(0.15);
  const [technicalWeight, setTechnicalWeight] = useState(0.30);

  useEffect(() => {
    if (!config) return;
    setSymbols(config.symbols ?? '');
    setWebhookUrl(config.tradingViewWebhookUrl ?? '');
    setAutoSend(config.autoSendToTradingView ?? false);
    setThreshold(config.confidenceThreshold ?? 0.6);
    setMacroWeight(config.macroWeight ?? 0.25);
    setOrderbookWeight(config.orderbookWeight ?? 0.30);
    setEarningsWeight(config.earningsWeight ?? 0.15);
    setTechnicalWeight(config.technicalWeight ?? 0.30);
  }, [config]);

  function save() {
    updateConfig({
      data: {
        symbols,
        tradingViewWebhookUrl: webhookUrl,
        autoSendToTradingView: autoSend,
        confidenceThreshold: threshold,
        macroWeight,
        orderbookWeight,
        earningsWeight,
        technicalWeight,
      },
    });
  }

  const totalWeight = macroWeight + orderbookWeight + earningsWeight + technicalWeight;
  const weightOk = Math.abs(totalWeight - 1) < 0.02;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0d1b35', '#0e141f']} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <Text style={styles.title}>Settings</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>Engine configuration</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Symbols */}
          <SectionHeader title="Tracked Symbols" subtitle="Comma-separated list" style={styles.section} />
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            value={symbols}
            onChangeText={setSymbols}
            placeholder="AAPL, TSLA, MSFT"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {/* Webhook */}
          <SectionHeader title="TradingView Webhook URL" style={[styles.section, { marginTop: 24 }]} />
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            value={webhookUrl}
            onChangeText={setWebhookUrl}
            placeholder="https://your-tradingview-webhook-url"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {/* Auto-send toggle */}
          <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Auto-send Signals</Text>
              <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                Push every generated signal to TradingView
              </Text>
            </View>
            <Switch
              value={autoSend}
              onValueChange={setAutoSend}
              trackColor={{ false: colors.input, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Confidence threshold */}
          <SectionHeader
            title="Confidence Threshold"
            subtitle={`${(threshold * 100).toFixed(0)}% — signals below this are filtered`}
            style={[styles.section, { marginTop: 24 }]}
          />
          <View style={[styles.sliderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={threshold}
              onValueChange={setThreshold}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.input}
              thumbTintColor={colors.primary}
            />
            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderMin, { color: colors.mutedForeground }]}>0%</Text>
              <Text style={[styles.sliderValue, { color: colors.primary }]}>{(threshold * 100).toFixed(0)}%</Text>
              <Text style={[styles.sliderMax, { color: colors.mutedForeground }]}>100%</Text>
            </View>
          </View>

          {/* Weights */}
          <SectionHeader
            title="Module Weights"
            subtitle={`Total: ${(totalWeight * 100).toFixed(0)}% ${weightOk ? '✓' : '— must sum to 100%'}`}
            style={[styles.section, { marginTop: 24 }]}
          />
          <View style={[styles.sliderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <WeightSlider label="Macro" value={macroWeight} onChange={setMacroWeight} colors={colors} />
            <WeightSlider label="Orderbook" value={orderbookWeight} onChange={setOrderbookWeight} colors={colors} />
            <WeightSlider label="Earnings" value={earningsWeight} onChange={setEarningsWeight} colors={colors} />
            <WeightSlider label="Technical" value={technicalWeight} onChange={setTechnicalWeight} colors={colors} />
          </View>

          {/* Save */}
          <Pressable
            style={[
              styles.saveBtn,
              { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 },
            ]}
            onPress={save}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Configuration</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colors: any;
}) {
  return (
    <View style={wsStyles.wrap}>
      <View style={wsStyles.row}>
        <Text style={[wsStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[wsStyles.val, { color: colors.foreground }]}>{(value * 100).toFixed(0)}%</Text>
      </View>
      <Slider
        style={{ width: '100%', height: 36 }}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.input}
        thumbTintColor={colors.primary}
      />
    </View>
  );
}

const wsStyles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  val: { fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: { paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  section: {},
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 24,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleSub: { fontSize: 12, marginTop: 2, maxWidth: 220 },
  sliderCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -6 },
  sliderMin: { fontSize: 11 },
  sliderMax: { fontSize: 11 },
  sliderValue: { fontSize: 18, fontWeight: '800' },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

import { db, signalsTable, engineConfigTable, webhookLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { fetchTechnicalMetrics } from "./technical-fetcher.js";
import { fetchOrderbookForSymbol } from "./orderbook-fetcher.js";
import { fetchMacroData } from "./macro-fetcher.js";
import { generateSignal } from "./strategy-engine.js";
import { sendToTradingView } from "./tradingview-sender.js";
import { ScannerHealth, GeneratedSignal } from "./types.js";

const DEFAULT_SCAN_INTERVAL_MS = 60 * 1000; // Scan every 60 seconds

class ScannerLoopManager {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalMs = DEFAULT_SCAN_INTERVAL_MS;
  private lastSuccessfulRun: string | null = null;
  private lastError: string | null = null;
  private totalScans = 0;
  private failedScans = 0;

  private circuitBreakers: Record<
    string,
    { isOpen: boolean; failedAttempts: number; retryAt: string | null }
  > = {
    binance: { isOpen: false, failedAttempts: 0, retryAt: null },
    coinbase: { isOpen: false, failedAttempts: 0, retryAt: null },
    yahoo: { isOpen: false, failedAttempts: 0, retryAt: null },
  };

  public getHealth(): ScannerHealth {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      lastSuccessfulRun: this.lastSuccessfulRun,
      lastError: this.lastError,
      totalScans: this.totalScans,
      failedScans: this.failedScans,
      circuitBreakers: JSON.parse(JSON.stringify(this.circuitBreakers)),
    };
  }

  public start(intervalMs = DEFAULT_SCAN_INTERVAL_MS) {
    if (this.isRunning) return;
    this.intervalMs = intervalMs;
    this.isRunning = true;
    logger.info({ intervalMs }, "Background automated scanner loop started");

    // Execute first scan immediately, then schedule interval
    this.runScanCycle().catch((err) => {
      logger.error({ err }, "Initial scan cycle error");
    });

    this.timer = setInterval(() => {
      this.runScanCycle().catch((err) => {
        logger.error({ err }, "Interval scan cycle error");
      });
    }, this.intervalMs);
  }

  public stop() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info("Background automated scanner loop stopped");
  }

  public async runScanCycle(): Promise<GeneratedSignal[]> {
    this.totalScans++;
    const generated: GeneratedSignal[] = [];

    try {
      // 1. Fetch engine configuration from Postgres DB
      const [config] = await db.select().from(engineConfigTable).limit(1);
      const symbolsStr = config?.symbols || "BTCUSDT,ETHUSDT,AAPL";
      const symbols = symbolsStr.split(",").map((s) => s.trim()).filter(Boolean);

      const weights = config
        ? {
            macro: config.macroWeight,
            orderbook: config.orderbookWeight,
            earnings: config.earningsWeight,
            technical: config.technicalWeight,
            threshold: config.signalThreshold,
            atrSlMultiplier: config.atrSlMultiplier ?? 1.5,
            atrTpMultiplier: config.atrTpMultiplier ?? 3.0,
          }
        : {};

      // 2. Fetch shared Macro metrics once per scan cycle
      const macroMetrics = await fetchMacroData().catch(() => undefined);

      // 3. Process each symbol independently with fault-tolerant symbol-level try-catch
      for (const symbol of symbols) {
        try {
          const [technical, liquidity] = await Promise.all([
            fetchTechnicalMetrics(symbol).catch(() => undefined),
            fetchOrderbookForSymbol(symbol).catch(() => undefined),
          ]);

          const signal = generateSignal(
            symbol,
            {
              technical,
              liquidity,
              macro: macroMetrics,
            },
            weights,
          );

          generated.push(signal);

          // 4. Save signal to Database
          const [saved] = await db
            .insert(signalsTable)
            .values({
              signalId: signal.id,
              symbol: signal.symbol,
              finalSignal: signal.finalSignal,
              confidence: signal.confidence,
              score: signal.score,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              dataConfidence: signal.dataConfidence,
              rsi: signal.metrics.rsi,
              macdHist: signal.metrics.macdHist,
              emaTrend: signal.metrics.emaTrend,
              macroSignal: signal.macroSignal,
              orderbookSignal: signal.orderbookSignal,
              earningsSignal: signal.earningsSignal,
              technicalSignal: signal.technicalSignal,
              sentToTradingView: false,
            })
            .returning();

          // 5. Automatically dispatch to TradingView if autoSendEnabled and signal is actionable
          if (config?.autoSendEnabled && signal.finalSignal !== "NONE") {
            const webhookUrl = config.tradingViewWebhookUrl ?? "";
            const result = await sendToTradingView(webhookUrl, signal);

            if (saved) {
              await db
                .update(signalsTable)
                .set({ sentToTradingView: result.success })
                .where(eq(signalsTable.id, saved.id));
              saved.sentToTradingView = result.success;
            }

            await db.insert(webhookLogsTable).values({
              direction: "outbound",
              payload: JSON.stringify(signal),
              status: result.success ? "success" : "error",
              errorMessage: result.error ?? null,
            });
          }
        } catch (symErr) {
          logger.error({ symbol, err: symErr }, "Scanner error processing symbol");
        }
      }

      this.lastSuccessfulRun = new Date().toISOString();
      this.lastError = null;
    } catch (cycleErr) {
      this.failedScans++;
      this.lastError = cycleErr instanceof Error ? cycleErr.message : String(cycleErr);
      logger.error({ err: cycleErr }, "Scanner scan cycle failed");
    }

    return generated;
  }
}

export const scannerLoop = new ScannerLoopManager();

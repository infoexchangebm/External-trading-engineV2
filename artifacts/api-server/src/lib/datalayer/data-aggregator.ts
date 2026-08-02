import { logger } from "../logger.js";

export interface SymbolMarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spreadPips: number;
  currentAtr: number;
  baselineAtr: number;
  orderbookImbalance: number;
  rsi: number;
  macdHist: number;
  emaTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  updatedAt: string;
}

export interface EconomicNewsEvent {
  id: string;
  title: string;
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  time: string;
}

export class DataAggregator {
  private priceCache: Map<string, SymbolMarketData> = new Map();
  private vixValue = 18.5;
  private fedSignal: "DOVISH" | "HAWKISH" | "NEUTRAL" = "NEUTRAL";
  private sentimentScore = 0.15; // -1 to +1
  private newsEvents: EconomicNewsEvent[] = [];

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData(): void {
    const defaultSymbols = ["EURUSD", "GBPUSD", "XAUUSD", "AAPL", "SPY", "CL=F", "BTCUSD"];
    for (const sym of defaultSymbols) {
      this.updateMarketData(sym, {
        price: sym.includes("BTC") ? 65000 : sym.includes("XAU") ? 2350 : sym.includes("AAPL") ? 220 : 1.1050,
        bid: sym.includes("BTC") ? 64990 : sym.includes("XAU") ? 2349.5 : sym.includes("AAPL") ? 219.9 : 1.1049,
        ask: sym.includes("BTC") ? 65010 : sym.includes("XAU") ? 2350.5 : sym.includes("AAPL") ? 220.1 : 1.1051,
        spreadPips: 1.0,
        currentAtr: sym.includes("XAU") ? 15.0 : 0.0045,
        baselineAtr: sym.includes("XAU") ? 12.0 : 0.0040,
        orderbookImbalance: 0.25,
        rsi: 54.0,
        macdHist: 0.0012,
        emaTrend: "BULLISH",
      });
    }

    // Default upcoming economic news events
    this.newsEvents = [
      {
        id: "evt_01",
        title: "FOMC Interest Rate Decision",
        currency: "USD",
        impact: "HIGH",
        time: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      },
      {
        id: "evt_02",
        title: "US Consumer Price Index (CPI)",
        currency: "USD",
        impact: "HIGH",
        time: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      },
    ];
  }

  public updateMarketData(symbol: string, data: Partial<SymbolMarketData>): SymbolMarketData {
    const existing = this.priceCache.get(symbol) || {
      symbol,
      price: 100,
      bid: 99.9,
      ask: 100.1,
      spreadPips: 1.0,
      currentAtr: 1.0,
      baselineAtr: 1.0,
      orderbookImbalance: 0,
      rsi: 50,
      macdHist: 0,
      emaTrend: "NEUTRAL" as const,
      updatedAt: new Date().toISOString(),
    };

    const updated: SymbolMarketData = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.priceCache.set(symbol, updated);
    return updated;
  }

  public getMarketData(symbol: string): SymbolMarketData | undefined {
    return this.priceCache.get(symbol);
  }

  public getMacroSentiment() {
    return {
      vix: this.vixValue,
      fedSignal: this.fedSignal,
      sentimentScore: this.sentimentScore,
      upcomingNews: this.newsEvents,
    };
  }

  public getUpcomingHighImpactNews(): EconomicNewsEvent | undefined {
    const now = Date.now();
    return this.newsEvents.find((evt) => {
      if (evt.impact !== "HIGH") return false;
      const t = new Date(evt.time).getTime();
      return Math.abs(t - now) <= 30 * 60 * 1000;
    });
  }
}

export const dataAggregator = new DataAggregator();

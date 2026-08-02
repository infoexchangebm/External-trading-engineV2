import { IBrokerAdapter } from "./broker-interface.js";
import { PaperBrokerAdapter } from "./paper-broker.js";
import { OandaAdapter } from "./oanda-adapter.js";
import { BinanceAdapter } from "./binance-adapter.js";
import { DerivAdapter } from "./deriv-adapter.js";
import { ICMarketsFixAdapter } from "./fix-adapter.js";
import { MT5ConnectorAdapter } from "./mt5-adapter.js";
import { logger } from "../logger.js";

export class BrokerFactory {
  private static adapters: Map<string, IBrokerAdapter> = new Map();

  static {
    const paper = new PaperBrokerAdapter();
    const oanda = new OandaAdapter();
    const binance = new BinanceAdapter();
    const deriv = new DerivAdapter();
    const fix = new ICMarketsFixAdapter();
    const mt5 = new MT5ConnectorAdapter();

    this.adapters.set(paper.id, paper);
    this.adapters.set(oanda.id, oanda);
    this.adapters.set(binance.id, binance);
    this.adapters.set(deriv.id, deriv);
    this.adapters.set(fix.id, fix);
    this.adapters.set(mt5.id, mt5);
  }

  public static getAdapter(brokerId = "paper"): IBrokerAdapter {
    const adapter = this.adapters.get(brokerId.toLowerCase());
    if (!adapter) {
      logger.warn({ requested: brokerId, fallback: "paper" }, "Broker adapter not found, using PaperBrokerAdapter");
      return this.adapters.get("paper")!;
    }
    return adapter;
  }

  public static listAvailableBrokers(): Array<{ id: string; name: string }> {
    return Array.from(this.adapters.values()).map((a) => ({ id: a.id, name: a.name }));
  }
}

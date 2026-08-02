import { db, observabilityLogsTable } from "@workspace/db";
import { logger } from "../logger.js";

export type SOCCategory = "STRATEGY" | "EXECUTION" | "RISK" | "ERROR" | "SYSTEM";
export type SOCLogLevel = "INFO" | "WARN" | "ERROR" | "FATAL";

export interface SOCLogEntry {
  category: SOCCategory;
  level: SOCLogLevel;
  message: string;
  symbol?: string;
  tradeId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class SOCLogger {
  private memoryBuffer: SOCLogEntry[] = [];
  private maxBufferSize = 200;

  public async log(
    category: SOCCategory,
    level: SOCLogLevel,
    message: string,
    details?: { symbol?: string; tradeId?: string; metadata?: Record<string, unknown> },
  ): Promise<SOCLogEntry> {
    const entry: SOCLogEntry = {
      category,
      level,
      message,
      symbol: details?.symbol,
      tradeId: details?.tradeId,
      metadata: details?.metadata,
      timestamp: new Date().toISOString(),
    };

    this.memoryBuffer.unshift(entry);
    if (this.memoryBuffer.length > this.maxBufferSize) {
      this.memoryBuffer.pop();
    }

    // Logger output
    const logPayload = { category, symbol: entry.symbol, tradeId: entry.tradeId, ...entry.metadata };
    if (level === "FATAL" || level === "ERROR") {
      logger.error(logPayload, `[SOC ${category}] ${message}`);
    } else if (level === "WARN") {
      logger.warn(logPayload, `[SOC ${category}] ${message}`);
    } else {
      logger.info(logPayload, `[SOC ${category}] ${message}`);
    }

    // Persist to Postgres DB asynchronously
    try {
      await db.insert(observabilityLogsTable).values({
        category,
        level,
        message,
        symbol: details?.symbol ?? null,
        tradeId: details?.tradeId ?? null,
        metadata: details?.metadata ?? null,
      });
    } catch (dbErr) {
      // Non-blocking log persistence failure fallback
      logger.warn({ dbErr }, "Failed to write SOC log entry to Postgres DB");
    }

    return entry;
  }

  public getRecentLogs(limit = 50, category?: SOCCategory): SOCLogEntry[] {
    let filtered = [...this.memoryBuffer];
    if (category) {
      filtered = filtered.filter((l) => l.category === category);
    }
    return filtered.slice(0, limit);
  }
}

export const socLogger = new SOCLogger();

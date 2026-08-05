export function inferAssetClass(symbol: string): "FX" | "COMMODITIES" | "CRYPTO" | "EQUITIES" {
  if (symbol.includes("XAU")) return "COMMODITIES";
  if (symbol.includes("BTC")) return "CRYPTO";
  return "FX";
}

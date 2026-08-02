import { useGetOrderbook, useGetMacroData, useGetEarningsData } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function Data() {
  const { data: orderbook, isLoading: isLoadingOrderbook } = useGetOrderbook();
  const { data: macro, isLoading: isLoadingMacro } = useGetMacroData();
  const { data: earnings, isLoading: isLoadingEarnings } = useGetEarningsData();

  const getSignalColor = (signal: string | null | undefined) => {
    if (!signal) return "text-muted-foreground bg-muted border-border";
    const s = signal.toUpperCase();
    if (s === "BULLISH" || s === "DOVISH" || s === "BUY" || s === "LOW") return "text-success bg-success/10 border-success/20";
    if (s === "BEARISH" || s === "HAWKISH" || s === "SELL" || s === "HIGH") return "text-destructive bg-destructive/10 border-destructive/20";
    return "text-muted-foreground bg-muted border-border";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Panel 1: Orderbook */}
      <Card className="border-border flex flex-col h-[calc(100vh-140px)]">
        <CardHeader className="border-b border-border py-4 bg-card shrink-0">
          <CardTitle className="text-base font-semibold">Orderbook Imbalance</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto flex-1">
          {isLoadingOrderbook ? (
            <div className="p-6 space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : orderbook?.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No active orderbook data</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-center">Signal</TableHead>
                  <TableHead className="text-right">Imbalance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderbook?.map((entry) => (
                  <TableRow key={entry.symbol} className="hover:bg-accent/50">
                    <TableCell className="font-bold mono-data text-sm">{entry.symbol}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("uppercase text-[10px]", getSignalColor(entry.signal))}>
                        {entry.signal.substring(0, 4)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden flex">
                          {entry.imbalance > 0 ? (
                            <div className="h-full bg-success ml-auto" style={{ width: `${Math.abs(entry.imbalance) * 100}%` }} />
                          ) : (
                            <div className="h-full bg-destructive" style={{ width: `${Math.abs(entry.imbalance) * 100}%` }} />
                          )}
                        </div>
                        <span className={cn("text-xs font-bold mono-data w-10 text-right", 
                          entry.imbalance > 0 ? "text-success" : entry.imbalance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {(entry.imbalance * 100).toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Panel 2: Macro */}
      <Card className="border-border flex flex-col h-[calc(100vh-140px)]">
        <CardHeader className="border-b border-border py-4 bg-card shrink-0">
          <CardTitle className="text-base font-semibold">Macro Climate</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto flex-1 bg-accent/20">
          {isLoadingMacro ? (
            <div className="p-6 space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : macro ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 p-4 bg-card border border-border rounded flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-muted-foreground font-medium uppercase">Fed Signal</span>
                  <Badge variant="outline" className={cn("uppercase mt-2", getSignalColor(macro.fedSignal))}>
                    {macro.fedSignal}
                  </Badge>
                </div>
                <div className="space-y-1 p-4 bg-card border border-border rounded flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-muted-foreground font-medium uppercase">Inflation</span>
                  <Badge variant="outline" className={cn("uppercase mt-2", getSignalColor(macro.inflationSignal))}>
                    {macro.inflationSignal}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Economic Indicators</h4>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between items-center p-3 bg-card border border-border rounded">
                    <span className="text-sm font-medium">VIX (Volatility)</span>
                    <span className="mono-data font-bold">{macro.vix || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-card border border-border rounded">
                    <span className="text-sm font-medium">CPI (Inflation)</span>
                    <span className="mono-data font-bold">{macro.cpi || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-card border border-border rounded">
                    <span className="text-sm font-medium">GDP Growth</span>
                    <span className="mono-data font-bold">{macro.gdp || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-center pt-4 border-t border-border/50 mono-data">
                Last updated: {format(new Date(macro.updatedAt), "yyyy-MM-dd HH:mm:ss")}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground text-sm">No macro data available</div>
          )}
        </CardContent>
      </Card>

      {/* Panel 3: Earnings */}
      <Card className="border-border flex flex-col h-[calc(100vh-140px)]">
        <CardHeader className="border-b border-border py-4 bg-card shrink-0">
          <CardTitle className="text-base font-semibold">Earnings Calendar</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto flex-1">
          {isLoadingEarnings ? (
            <div className="p-6 space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : earnings?.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No upcoming earnings</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ticker</TableHead>
                  <TableHead>Surprise</TableHead>
                  <TableHead className="text-right">Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings?.map((entry) => (
                  <TableRow key={`${entry.ticker}-${entry.reportDate}`} className="hover:bg-accent/50">
                    <TableCell>
                      <div className="font-bold mono-data text-sm">{entry.ticker}</div>
                      <div className="text-[10px] text-muted-foreground mono-data mt-0.5">
                        {format(new Date(entry.reportDate), "MMM d")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {entry.surprise != null ? (
                        <span className={cn("text-xs font-bold mono-data", 
                          entry.surprise > 0 ? "text-success" : entry.surprise < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {entry.surprise > 0 ? "+" : ""}{entry.surprise}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cn("uppercase text-[10px]", getSignalColor(entry.signal))}>
                        {entry.signal || "NONE"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

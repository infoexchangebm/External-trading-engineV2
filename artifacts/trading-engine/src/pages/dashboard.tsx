import { useGetSignalSummary, useGetMacroData, useGetOrderbook, useHealthCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Activity, TrendingUp, TrendingDown, Minus, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetSignalSummary();
  const { data: macro, isLoading: isLoadingMacro } = useGetMacroData();
  const { data: orderbook, isLoading: isLoadingOrderbook } = useGetOrderbook();
  const { data: health } = useHealthCheck();

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "BUY":
      case "BULLISH":
      case "DOVISH":
      case "LOW":
        return "text-success bg-success/10 border-success/20";
      case "SELL":
      case "BEARISH":
      case "HAWKISH":
      case "HIGH":
        return "text-destructive bg-destructive/10 border-destructive/20";
      default:
        return "text-muted-foreground bg-muted border-border";
    }
  };

  const getSignalIcon = (signal: string) => {
    if (signal === "BUY" || signal === "BULLISH") return <TrendingUp className="w-4 h-4 text-success" />;
    if (signal === "SELL" || signal === "BEARISH") return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Signals</p>
                <div className="text-3xl font-bold mono-data">
                  {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : summary?.totalSignals}
                </div>
              </div>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">BUY Signals</p>
                <div className="text-3xl font-bold mono-data text-success">
                  {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : summary?.buyCount}
                </div>
              </div>
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">SELL Signals</p>
                <div className="text-3xl font-bold mono-data text-destructive">
                  {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : summary?.sellCount}
                </div>
              </div>
              <TrendingDown className="w-5 h-5 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Avg Confidence</p>
                <div className="text-3xl font-bold mono-data">
                  {isLoadingSummary ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    `${((summary?.avgConfidence || 0) * 100).toFixed(1)}%`
                  )}
                </div>
              </div>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Engine Status</p>
                <div className="text-xl font-bold flex items-center gap-2">
                  {health ? (
                    <>
                      <span className="w-3 h-3 rounded-full bg-success animate-pulse"></span>
                      {health.status}
                    </>
                  ) : (
                    <Skeleton className="h-8 w-16" />
                  )}
                </div>
              </div>
              <Cpu className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Signals */}
        <Card className="lg:col-span-2 border-border flex flex-col">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base font-semibold">Recent Signals</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[500px]">
            {isLoadingSummary ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : summary?.recentSignals.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-4 opacity-50" />
                <p>No recent signals</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {summary?.recentSignals.map((signal) => (
                  <div key={signal.id} className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-10 h-10 rounded flex items-center justify-center border", getSignalColor(signal.finalSignal))}>
                        {getSignalIcon(signal.finalSignal)}
                      </div>
                      <div>
                        <div className="font-bold text-lg mono-data">{signal.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(signal.createdAt), "MMM d, HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground mb-1 uppercase">Confidence</div>
                        <div className="mono-data font-medium">{(signal.confidence * 100).toFixed(1)}%</div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground mb-1 uppercase">Sent to TV</div>
                        <div>
                          {signal.sentToTradingView ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 uppercase text-[10px]">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground uppercase text-[10px]">No</Badge>
                          )}
                        </div>
                      </div>
                      <div className="w-24 text-right">
                        <Badge variant="outline" className={cn("uppercase text-xs font-bold w-full justify-center py-1", getSignalColor(signal.finalSignal))}>
                          {signal.finalSignal}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Macro & Orderbook */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base font-semibold">Macro Climate</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMacro ? (
                <div className="p-6 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
              ) : macro ? (
                <div className="divide-y divide-border">
                  <div className="flex justify-between items-center p-4">
                    <span className="text-sm font-medium">Fed Stance</span>
                    <Badge variant="outline" className={cn("uppercase", getSignalColor(macro.fedSignal))}>
                      {macro.fedSignal}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-4">
                    <span className="text-sm font-medium">Inflation</span>
                    <Badge variant="outline" className={cn("uppercase", getSignalColor(macro.inflationSignal))}>
                      {macro.inflationSignal}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-border">
                    <div className="p-3 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">VIX</div>
                      <div className="mono-data font-bold">{macro.vix || "-"}</div>
                    </div>
                    <div className="p-3 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">CPI</div>
                      <div className="mono-data font-bold">{macro.cpi || "-"}</div>
                    </div>
                    <div className="p-3 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">GDP</div>
                      <div className="mono-data font-bold">{macro.gdp || "-"}</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="border-b border-border py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Orderbook Imbalance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingOrderbook ? (
                <div className="p-6 space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
              ) : orderbook?.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No data</div>
              ) : (
                <div className="divide-y divide-border max-h-[250px] overflow-auto">
                  {orderbook?.map((entry) => (
                    <div key={entry.symbol} className="p-3 px-4 flex items-center justify-between">
                      <span className="font-bold mono-data text-sm">{entry.symbol}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden flex">
                          {entry.imbalance > 0 ? (
                            <div className="h-full bg-success ml-auto" style={{ width: `${Math.abs(entry.imbalance) * 100}%` }} />
                          ) : (
                            <div className="h-full bg-destructive" style={{ width: `${Math.abs(entry.imbalance) * 100}%` }} />
                          )}
                        </div>
                        <span className={cn("text-xs font-bold mono-data w-12 text-right", 
                          entry.imbalance > 0 ? "text-success" : entry.imbalance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {(entry.imbalance * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

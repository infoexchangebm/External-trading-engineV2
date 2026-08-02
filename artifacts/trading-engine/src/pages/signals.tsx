import { useState } from "react";
import { useListSignals, useGenerateSignal, getListSignalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Search, Loader2, Target, ShieldAlert } from "lucide-react";

export default function Signals() {
  const [symbolFilter, setSymbolFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [newSymbol, setNewSymbol] = useState("");
  const [sendToTv, setSendToTv] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = {
    ...(symbolFilter ? { symbol: symbolFilter } : {}),
    ...(typeFilter !== "ALL" ? { finalSignal: typeFilter } : {}),
    limit: 50,
  };

  const { data: signals, isLoading } = useListSignals(queryParams);
  const generateSignal = useGenerateSignal();

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;

    generateSignal.mutate(
      { data: { symbol: newSymbol.toUpperCase(), sendToTradingView: sendToTv } },
      {
        onSuccess: () => {
          toast({
            title: "Signal generated",
            description: `Successfully analyzed and generated signal for ${newSymbol.toUpperCase()}`,
          });
          setNewSymbol("");
          queryClient.invalidateQueries({ queryKey: getListSignalsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message || "Failed to generate signal",
            variant: "destructive",
          });
        },
      },
    );
  };

  const getSignalColor = (signal: string) => {
    if (signal === "BUY" || signal === "BULLISH") return "text-success bg-success/10 border-success/20";
    if (signal === "SELL" || signal === "BEARISH") return "text-destructive bg-destructive/10 border-destructive/20";
    return "text-muted-foreground bg-muted border-border";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
        <Card className="w-full md:w-auto border-border">
          <CardContent className="p-4">
            <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Input
                  placeholder="SYMBOL (e.g. BTCUSD, AAPL)"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="mono-data uppercase w-full sm:w-52"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={sendToTv} onCheckedChange={setSendToTv} id="send-tv" />
                <label htmlFor="send-tv" className="text-sm font-medium whitespace-nowrap">
                  Send to TradingView
                </label>
              </div>
              <Button type="submit" disabled={generateSignal.isPending || !newSymbol} className="w-full sm:w-auto">
                {generateSignal.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Analyze & Generate
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter symbol..."
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="pl-9 mono-data uppercase"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
              <SelectItem value="NONE">NONE</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="border-b border-border py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Signal History & Execution Targets</CardTitle>
          <Badge variant="outline" className="text-xs bg-accent/20">
            Real Quant Engine Active
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[160px]">Date / Time</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Final Signal</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="hidden md:table-cell text-center">SL / TP Targets</TableHead>
                <TableHead className="hidden md:table-cell text-center">Macro</TableHead>
                <TableHead className="hidden md:table-cell text-center">Orderbook</TableHead>
                <TableHead className="hidden lg:table-cell text-center">Technical</TableHead>
                <TableHead className="text-center">TV Hook</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28 mx-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  </TableRow>
                ))
              ) : signals?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No signals found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                signals?.map((signal: any) => (
                  <TableRow key={signal.id} className="hover:bg-accent/50">
                    <TableCell className="text-muted-foreground text-xs mono-data whitespace-nowrap">
                      {format(new Date(signal.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-bold mono-data text-sm">
                      {signal.symbol}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("uppercase text-[10px] font-bold", getSignalColor(signal.finalSignal))}>
                        {signal.finalSignal}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right mono-data text-sm font-medium">
                      {(signal.confidence * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center mono-data text-xs">
                      {signal.stopLoss && signal.takeProfit ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-destructive flex items-center gap-1" title="Stop Loss">
                            <ShieldAlert className="w-3 h-3" />
                            {signal.stopLoss}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-success flex items-center gap-1" title="Take Profit">
                            <Target className="w-3 h-3" />
                            {signal.takeProfit}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                      <Badge variant="outline" className={cn("uppercase text-[10px]", getSignalColor(signal.macroSignal))}>
                        {signal.macroSignal.substring(0, 4)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                      <Badge variant="outline" className={cn("uppercase text-[10px]", getSignalColor(signal.orderbookSignal))}>
                        {signal.orderbookSignal.substring(0, 4)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-center">
                      <Badge variant="outline" className={cn("uppercase text-[10px]", getSignalColor(signal.technicalSignal))}>
                        {signal.technicalSignal.substring(0, 4)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {signal.sentToTradingView ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-success" title="Sent to TradingView" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-muted" title="Not sent" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

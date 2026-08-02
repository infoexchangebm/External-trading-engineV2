import { useState } from "react";
import { useListWebhookLogs, useSendSignalToTradingView, getListWebhookLogsQueryKey, useGetConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Copy, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

export default function Webhook() {
  const [symbol, setSymbol] = useState("");
  const [signal, setSignal] = useState<"BUY" | "SELL" | "NONE">("BUY");
  const [confidence, setConfidence] = useState("0.85");
  const [copied, setCopied] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: logs, isLoading: isLoadingLogs } = useListWebhookLogs({ limit: 100 });
  const { data: config } = useGetConfig();
  const sendSignal = useSendSignalToTradingView();

  const handleSendSignal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol) return;
    
    sendSignal.mutate(
      { data: { symbol: symbol.toUpperCase(), finalSignal: signal, confidence: parseFloat(confidence) } },
      {
        onSuccess: () => {
          toast({ title: "Webhook fired", description: `Signal sent to TradingView for ${symbol.toUpperCase()}` });
          queryClient.invalidateQueries({ queryKey: getListWebhookLogsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to send webhook", variant: "destructive" });
        }
      }
    );
  };

  const copyWebhookUrl = () => {
    // In a real app we'd construct the full URL. Here we use a placeholder or config value.
    const url = window.location.origin + "/api/webhook/tradingview";
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Webhook URL copied to clipboard" });
  };

  const refreshLogs = () => {
    queryClient.invalidateQueries({ queryKey: getListWebhookLogsQueryKey() });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Instructions & Manual Send */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-border">
            <CardHeader className="border-b border-border py-4 bg-primary/5">
              <CardTitle className="text-base font-semibold">TradingView Integration</CardTitle>
              <CardDescription>Wire alerts to the engine</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <p className="text-muted-foreground">
                Configure TradingView alerts to trigger webhook requests to the engine URL below.
              </p>
              <div className="space-y-2">
                <label className="font-medium text-xs uppercase text-muted-foreground">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={window.location.origin + "/api/webhook/tradingview"} 
                    className="font-mono text-xs bg-muted"
                  />
                  <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                    {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <label className="font-medium text-xs uppercase text-muted-foreground">Payload Format (JSON)</label>
                <div className="bg-muted p-3 rounded-md font-mono text-[10px] overflow-x-auto text-muted-foreground">
                  <pre>{`{
  "symbol": "{{ticker}}",
  "action": "BUY",
  "price": {{close}}
}`}</pre>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base font-semibold">Test Outbound Webhook</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSendSignal} className="space-y-4">
                <div className="space-y-2">
                  <label className="font-medium text-xs uppercase text-muted-foreground">Symbol</label>
                  <Input 
                    placeholder="BTCUSD" 
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="mono-data uppercase"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-medium text-xs uppercase text-muted-foreground">Signal</label>
                    <Select value={signal} onValueChange={(val: any) => setSignal(val)}>
                      <SelectTrigger className="mono-data">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY" className="text-success font-bold">BUY</SelectItem>
                        <SelectItem value="SELL" className="text-destructive font-bold">SELL</SelectItem>
                        <SelectItem value="NONE">NONE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-medium text-xs uppercase text-muted-foreground">Confidence</label>
                    <Input 
                      type="number" 
                      min="0" max="1" step="0.01" 
                      value={confidence}
                      onChange={(e) => setConfidence(e.target.value)}
                      className="mono-data"
                      required
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={sendSignal.isPending || !symbol}
                >
                  {sendSignal.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Fire Webhook
                </Button>
                {config?.tradingViewWebhookUrl && (
                  <p className="text-[10px] text-muted-foreground text-center pt-2 mono-data">
                    Target: {config.tradingViewWebhookUrl}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Log Table */}
        <Card className="lg:col-span-2 border-border flex flex-col h-[calc(100vh-140px)]">
          <CardHeader className="border-b border-border py-4 bg-card shrink-0 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Event Logs</CardTitle>
            <Button variant="outline" size="sm" onClick={refreshLogs} className="h-8">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[150px]">Time</TableHead>
                  <TableHead className="w-[100px]">Direction</TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                  <TableHead>Payload / Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingLogs ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : logs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No webhook logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs?.map((log) => (
                    <TableRow key={log.id} className="hover:bg-accent/50 group">
                      <TableCell className="text-muted-foreground text-xs mono-data whitespace-nowrap align-top pt-4">
                        {format(new Date(log.createdAt), "MM-dd HH:mm:ss.SSS")}
                      </TableCell>
                      <TableCell className="align-top pt-4">
                        {log.direction === "inbound" ? (
                          <div className="flex items-center gap-1.5 text-primary text-xs font-medium uppercase tracking-wider">
                            <ArrowDownLeft className="w-3.5 h-3.5" /> In
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium uppercase tracking-wider">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Out
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center align-top pt-3.5">
                        <Badge variant="outline" className={cn(
                          "uppercase text-[10px]",
                          log.status === "success" || log.status === "received" ? "text-success border-success/30 bg-success/10" : "text-destructive border-destructive/30 bg-destructive/10"
                        )}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top pt-4 pb-4">
                        {log.errorMessage ? (
                          <div className="text-xs text-destructive mb-2 font-medium">Error: {log.errorMessage}</div>
                        ) : null}
                        <div className="bg-muted p-2 rounded text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all border border-border/50 max-h-32 overflow-y-auto">
                          {log.payload}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

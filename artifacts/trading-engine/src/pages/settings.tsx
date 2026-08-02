import { useState, useEffect } from "react";
import { useGetConfig, useUpdateConfig, getGetConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Loader2, Save } from "lucide-react";
import { Slider } from "@/components/ui/slider";

export default function Settings() {
  const { data: config, isLoading } = useGetConfig();
  const updateConfig = useUpdateConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  
  const [webhookUrl, setWebhookUrl] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [threshold, setThreshold] = useState(0.75);

  const [weights, setWeights] = useState({
    macro: 0.25,
    orderbook: 0.25,
    earnings: 0.25,
    technical: 0.25
  });

  useEffect(() => {
    if (config) {
      setSymbols(config.symbols || []);
      setWebhookUrl(config.tradingViewWebhookUrl || "");
      setAutoSend(config.autoSendEnabled || false);
      setThreshold(config.signalThreshold || 0.75);
      setWeights({
        macro: config.macroWeight || 0,
        orderbook: config.orderbookWeight || 0,
        earnings: config.earningsWeight || 0,
        technical: config.technicalWeight || 0
      });
    }
  }, [config]);

  const totalWeight = weights.macro + weights.orderbook + weights.earnings + weights.technical;

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;
    const sym = newSymbol.toUpperCase();
    if (!symbols.includes(sym)) {
      setSymbols([...symbols, sym]);
    }
    setNewSymbol("");
  };

  const removeSymbol = (sym: string) => {
    setSymbols(symbols.filter(s => s !== sym));
  };

  const handleSave = () => {
    // We normalize weights if they don't equal exactly 1.0 (to avoid precision issues)
    const factor = totalWeight > 0 ? 1 / totalWeight : 1;
    
    const payload = {
      symbols,
      tradingViewWebhookUrl: webhookUrl,
      autoSendEnabled: autoSend,
      signalThreshold: threshold,
      macroWeight: weights.macro * factor,
      orderbookWeight: weights.orderbook * factor,
      earningsWeight: weights.earnings * factor,
      technicalWeight: weights.technical * factor,
    };

    updateConfig.mutate(
      { data: payload },
      {
        onSuccess: (updated) => {
          toast({ title: "Settings Saved", description: "Engine configuration updated successfully." });
          queryClient.setQueryData(getGetConfigQueryKey(), updated);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to update configuration", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Engine Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">Adjust signal parameters and core operational settings.</p>
        </div>
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core & TradingView */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base font-semibold">TradingView Output</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Auto-Send Signals</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically transmit confirmed signals to TV webhook
                  </p>
                </div>
                <Switch checked={autoSend} onCheckedChange={setAutoSend} />
              </div>

              <div className="space-y-3 pt-2">
                <Label className="uppercase text-xs tracking-wider text-muted-foreground">Target Webhook URL</Label>
                <Input 
                  value={webhookUrl} 
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hook.tradingview.com/..."
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <Label className="uppercase text-xs tracking-wider text-muted-foreground">Signal Threshold</Label>
                  <span className="mono-data font-bold text-primary">{(threshold * 100).toFixed(0)}%</span>
                </div>
                <Slider 
                  value={[threshold]} 
                  min={0.5} 
                  max={0.99} 
                  step={0.01} 
                  onValueChange={([val]) => setThreshold(val)} 
                  className="py-4"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum confidence score required to generate a final BUY/SELL signal.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base font-semibold">Tracked Symbols</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
                <Input 
                  value={newSymbol} 
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="Add symbol (e.g. AAPL)"
                  className="uppercase mono-data"
                />
                <Button type="submit" variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </form>

              <div className="flex flex-wrap gap-2">
                {symbols.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No symbols tracked.</span>
                ) : (
                  symbols.map(sym => (
                    <Badge key={sym} variant="outline" className="px-2 py-1 flex items-center gap-2 mono-data bg-card">
                      {sym}
                      <button 
                        onClick={() => removeSymbol(sym)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weights */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-base font-semibold">Signal Weights</CardTitle>
              <CardDescription>Configure influence of each module on the final score</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold text-sm">Macro Climate</Label>
                  <span className="mono-data font-bold text-sm">{(weights.macro * 100).toFixed(0)}%</span>
                </div>
                <Slider 
                  value={[weights.macro]} min={0} max={1} step={0.05} 
                  onValueChange={([val]) => setWeights({...weights, macro: val})} 
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold text-sm">Orderbook Imbalance</Label>
                  <span className="mono-data font-bold text-sm">{(weights.orderbook * 100).toFixed(0)}%</span>
                </div>
                <Slider 
                  value={[weights.orderbook]} min={0} max={1} step={0.05} 
                  onValueChange={([val]) => setWeights({...weights, orderbook: val})} 
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold text-sm">Earnings Calendar</Label>
                  <span className="mono-data font-bold text-sm">{(weights.earnings * 100).toFixed(0)}%</span>
                </div>
                <Slider 
                  value={[weights.earnings]} min={0} max={1} step={0.05} 
                  onValueChange={([val]) => setWeights({...weights, earnings: val})} 
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold text-sm">Technical Indicators</Label>
                  <span className="mono-data font-bold text-sm">{(weights.technical * 100).toFixed(0)}%</span>
                </div>
                <Slider 
                  value={[weights.technical]} min={0} max={1} step={0.05} 
                  onValueChange={([val]) => setWeights({...weights, technical: val})} 
                />
              </div>

            </CardContent>
            <CardFooter className="border-t border-border py-4 bg-muted/50 flex justify-between items-center">
              <span className="text-sm font-medium uppercase text-muted-foreground">Total Allocation</span>
              <span className={`font-bold mono-data text-lg ${Math.abs(totalWeight - 1.0) > 0.01 ? 'text-destructive' : 'text-success'}`}>
                {(totalWeight * 100).toFixed(0)}%
              </span>
            </CardFooter>
          </Card>
          
          {Math.abs(totalWeight - 1.0) > 0.01 && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-md text-sm font-medium flex items-start gap-3">
              <X className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p>Weights do not sum to 100%.</p>
                <p className="text-xs opacity-80 mt-1">If saved, they will be proportionally normalized.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

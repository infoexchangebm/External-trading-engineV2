import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Activity, 
  Database, 
  Settings, 
  Webhook,
  TerminalSquare,
  ScanSearch
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/signals", label: "Signals", icon: Activity },
  { href: "/data", label: "Market Data", icon: Database },
  { href: "/scanner", label: "Scanner", icon: ScanSearch },
  { href: "/webhook", label: "Webhooks", icon: Webhook },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="w-64 border-r border-border bg-sidebar shrink-0 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <TerminalSquare className="w-5 h-5 text-primary mr-2" />
          <span className="font-bold tracking-tight">ENGINE COCKPIT</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground mono-data uppercase">
          <div>Engine: Online</div>
          <div>Latency: 12ms</div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
          <h1 className="text-lg font-semibold capitalize tracking-tight">
            {navItems.find(item => item.href === location)?.label || "Dashboard"}
          </h1>
          <div className="flex items-center gap-4 text-sm mono-data">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              API Connected
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

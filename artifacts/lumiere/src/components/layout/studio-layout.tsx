import { ReactNode, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { FloatingContact } from "@/components/floating-contact";
import { SubscriptionExpiredModal } from "@/components/subscription/SubscriptionExpiredModal";
import { SubscriptionContext } from "@/hooks/use-subscription";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarDays, CreditCard, AlertTriangle } from "lucide-react";

type SubscriptionInfo = {
  status: string;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  daysRemaining: number | null;
};

function SidebarSubscriptionWidget({ onOpenPayment }: { onOpenPayment: () => void }) {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    fetch("/api/studio/subscription-info")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setInfo(data); })
      .catch(() => {});
  }, []);

  if (!info) return null;
  if (info.status !== "trial" && info.status !== "active") return null;

  const fmtDate = (iso: string | null) =>
    iso ? format(parseISO(iso), "dd/MM/yyyy", { locale: vi }) : "";

  const isTrialSoon = info.status === "trial" && (info.daysRemaining ?? 99) <= 7;
  const isExpiringSoon = info.status === "active" && (info.daysRemaining ?? 99) <= 14;
  const isUrgent = isTrialSoon || isExpiringSoon;

  const expiryDate = info.status === "trial" ? info.trialEndsAt : info.subscriptionExpiresAt;

  return (
    <div className={`mx-4 mb-3 rounded-lg border p-3 space-y-2.5 ${
      isUrgent
        ? "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30"
        : "border-border bg-muted/30"
    }`}>
      <div className="flex items-center gap-1.5">
        {isUrgent
          ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          : <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className={`text-xs font-medium ${isUrgent ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {info.status === "trial" ? "Dùng thử" : "Thuê bao"}
        </span>
      </div>

      {expiryDate && (
        <div className="text-xs text-foreground">
          <span className="text-muted-foreground">Hết hạn: </span>
          <span className="font-medium">{fmtDate(expiryDate)}</span>
          {info.daysRemaining !== null && (
            <span className={`ml-1 ${isUrgent ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"}`}>
              ({info.daysRemaining}d)
            </span>
          )}
        </div>
      )}

      <Button
        size="sm"
        variant={isUrgent ? "default" : "outline"}
        className="w-full h-7 text-xs"
        onClick={onOpenPayment}
      >
        <CreditCard className="h-3 w-3 mr-1" />
        {info.status === "trial" ? "Mua ngay" : "Gia hạn"}
      </Button>
    </div>
  );
}

export function StudioLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const openPaymentModal = useCallback(() => setPaymentOpen(true), []);

  return (
    <SubscriptionContext.Provider value={{ openPaymentModal }}>
      <div className="min-h-screen flex w-full bg-background">
        <aside className="w-64 border-r border-border bg-card flex flex-col">
          <div className="p-6">
            <h1 className="text-2xl font-serif font-bold text-primary">Lumière</h1>
            <p className="text-sm text-muted-foreground truncate">{user?.studio?.name}</p>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            <Link href="/dashboard">
              <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location === "/dashboard" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
                Tổng quan
              </span>
            </Link>
            <Link href="/dashboard/albums">
              <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location.startsWith("/dashboard/albums") ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
                Thư viện ảnh
              </span>
            </Link>
            <Link href="/dashboard/settings">
              <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location.startsWith("/dashboard/settings") ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
                Cài đặt
              </span>
            </Link>
          </nav>
          <div className="border-t border-border pt-3">
            <SidebarSubscriptionWidget onOpenPayment={openPaymentModal} />
            <div className="px-4 pb-4">
              <Button variant="ghost" className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={logout}>
                Đăng xuất
              </Button>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>

        <FloatingContact />
      </div>

      <SubscriptionExpiredModal
        open={paymentOpen}
        onPaid={() => { setPaymentOpen(false); window.location.reload(); }}
        onClose={() => setPaymentOpen(false)}
      />
    </SubscriptionContext.Provider>
  );
}

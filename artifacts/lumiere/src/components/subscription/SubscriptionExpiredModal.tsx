import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Copy, CheckCircle2, CreditCard } from "lucide-react";

type PaymentStatus = "pending" | "paid" | "cancelled";

type Plan = {
  months: number;
  label: string;
  discountPct: number;
  amount: number;
};

type PricingData = {
  monthlyPrice: number;
  plans: Plan[];
};

type OrderData = {
  qrCode: string;
  checkoutUrl?: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  amount: number;
  orderCode: number;
  months: number;
};

type Props = {
  open: boolean;
  onPaid: () => void;
  onClose?: () => void;
  title?: string;
};

function QRBlock({ qrUrl }: { qrUrl: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  if (!qrUrl) return (
    <div className="flex justify-center">
      <div className="w-64 h-64 rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-muted/20 text-xs text-muted-foreground text-center px-4">
        QR chưa khả dụng<br />Vui lòng chuyển khoản thủ công theo thông tin bên dưới
      </div>
    </div>
  );

  return (
    <div className="flex justify-center">
      <div className="relative w-64 h-64">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-muted/30">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-muted/20 text-xs text-muted-foreground text-center px-4">
            Không tải được QR<br />Chuyển khoản theo thông tin bên dưới
          </div>
        )}
        <img
          src={qrUrl}
          alt="QR Code thanh toán"
          className={`w-64 h-64 rounded-2xl border-2 border-border object-contain bg-white ${status === "error" ? "hidden" : ""}`}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
        />
      </div>
    </div>
  );
}

export function SubscriptionExpiredModal({ open, onPaid, onClose, title }: Props) {
  const [tab, setTab] = useState<"plans" | "payment">("plans");
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [copied, setCopied] = useState<string | false>(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/studio/pricing")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setPricing(data); })
        .catch(() => {});
    } else {
      setTab("plans");
      setOrderData(null);
      setPaymentStatus("pending");
      setSelectedMonths(1);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (orderData && paymentStatus === "pending") {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/studio/payment/status/${orderData.orderCode}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "paid") {
            setPaymentStatus("paid");
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setTimeout(() => {
              toast({ title: "Gia hạn thành công!", description: "Tài khoản của bạn đã được kích hoạt." });
              onPaid();
            }, 1000);
          }
        } catch {
          // silent
        }
      }, 5000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [orderData, paymentStatus, onPaid]);

  const handleCreateOrder = async () => {
    setIsCreatingOrder(true);
    try {
      const res = await fetch("/api/studio/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: selectedMonths }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "PAYOS_NOT_CONFIGURED") {
          toast({
            title: "Hệ thống thanh toán chưa sẵn sàng",
            description: "Vui lòng liên hệ quản trị viên để được hỗ trợ.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Lỗi", description: data.error || "Không thể tạo đơn thanh toán", variant: "destructive" });
        return;
      }

      setOrderData(data);
      setTab("payment");
    } catch {
      toast({ title: "Lỗi kết nối", description: "Vui lòng thử lại.", variant: "destructive" });
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const copyToClipboard = async (text: string, key: string = "default") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Không thể copy", variant: "destructive" });
    }
  };

  const fmt = (amount: number) => new Intl.NumberFormat("vi-VN").format(amount) + " ₫";

  const selectedPlan = pricing?.plans.find(p => p.months === selectedMonths);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && onClose) onClose(); }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={e => { if (!onClose) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <CreditCard className="h-5 w-5 text-primary" />
            {title ?? "Mua / Gia hạn thuê bao"}
          </DialogTitle>
        </DialogHeader>

        {tab === "plans" && (
          <div className="space-y-4">
            {!pricing ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Chọn gói phù hợp. Hệ thống tự động kích hoạt sau khi nhận thanh toán.</p>

                <div className="grid grid-cols-2 gap-2.5">
                  {pricing.plans.map((plan) => {
                    const isSelected = selectedMonths === plan.months;
                    const originalAmount = pricing.monthlyPrice * plan.months;
                    const hasSaving = plan.discountPct > 0;
                    return (
                      <button
                        key={plan.months}
                        type="button"
                        onClick={() => setSelectedMonths(plan.months)}
                        className={`relative rounded-xl border-2 p-3.5 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"
                        }`}
                      >
                        {hasSaving && (
                          <span className="absolute -top-2 right-2 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-tight">
                            -{plan.discountPct}%
                          </span>
                        )}
                        <div className="font-semibold text-sm text-foreground">{plan.label}</div>
                        <div className="mt-1 font-bold text-primary">{fmt(plan.amount)}</div>
                        {hasSaving && (
                          <div className="text-[11px] text-muted-foreground line-through">{fmt(originalAmount)}</div>
                        )}
                        {hasSaving && (
                          <div className="text-[11px] text-green-600 font-medium">Tiết kiệm {fmt(originalAmount - plan.amount)}</div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedPlan && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">Tổng thanh toán:</span>
                    <span className="font-bold text-primary text-base">{fmt(selectedPlan.amount)}</span>
                  </div>
                )}

                <Button className="w-full" onClick={handleCreateOrder} disabled={isCreatingOrder}>
                  {isCreatingOrder ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang tạo đơn...</>
                  ) : (
                    "Tiếp tục thanh toán"
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "payment" && orderData && (
          <div className="space-y-3">
            {paymentStatus === "paid" ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="font-semibold text-green-700">Thanh toán thành công!</p>
                <p className="text-sm text-muted-foreground text-center">Tài khoản của bạn đã được kích hoạt. Đang tải lại...</p>
              </div>
            ) : (
              <>
                {/* QR Code — large & prominent */}
                <QRBlock qrUrl={orderData.qrCode} />

                {/* Bank info — compact below */}
                <div className="rounded-xl border bg-muted/20 divide-y divide-border/60 text-xs">
                  {orderData.accountName && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground">Chủ TK</span>
                      <span className="font-semibold uppercase tracking-wide text-foreground">{orderData.accountName}</span>
                    </div>
                  )}
                  {orderData.accountNumber && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground">Số TK</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold font-mono text-sm text-foreground">{orderData.accountNumber}</span>
                        <button onClick={() => copyToClipboard(orderData.accountNumber, "acc")} className="text-muted-foreground hover:text-foreground transition-colors" title="Sao chép">
                          {copied === "acc" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted-foreground">Nội dung CK</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold font-mono text-foreground">{orderData.transferContent}</span>
                      <button onClick={() => copyToClipboard(orderData.transferContent, "content")} className="text-muted-foreground hover:text-foreground transition-colors" title="Sao chép">
                        {copied === "content" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted-foreground">Số tiền</span>
                    <span className="font-bold text-primary">{fmt(orderData.amount)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  Chuyển khoản đúng nội dung, hệ thống tự động kích hoạt trong vài giây
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={() => setTab("plans")}>
                  Quay lại chọn gói
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

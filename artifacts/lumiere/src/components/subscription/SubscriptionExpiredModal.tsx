import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Copy, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type PaymentStatus = "pending" | "paid" | "cancelled";

type OrderData = {
  qrCode: string;
  checkoutUrl?: string;
  transferContent: string;
  amount: number;
  orderCode: number;
};

type Props = {
  open: boolean;
  onPaid: () => void;
  title?: string;
  description?: string;
};

export function SubscriptionExpiredModal({ open, onPaid, title, description }: Props) {
  const [tab, setTab] = useState<"info" | "payment">("info");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setTab("info");
      setOrderData(null);
      setPaymentStatus("pending");
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

  const handleRenew = async () => {
    setIsCreatingOrder(true);
    try {
      const res = await fetch("/api/studio/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Không thể copy", variant: "destructive" });
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
  };

  return (
    <Dialog open={open} modal>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title ?? "Tài khoản hết hạn"}
          </DialogTitle>
        </DialogHeader>

        {tab === "info" && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {description ?? "Thời gian sử dụng của tài khoản đã hết. Vui lòng gia hạn để tiếp tục sử dụng dịch vụ Lumière Studio."}
            </p>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Thanh toán 1 tháng, hệ thống tự động kích hoạt ngay</span>
              </div>
            </div>
            <Button className="w-full" onClick={handleRenew} disabled={isCreatingOrder}>
              {isCreatingOrder ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang tạo đơn...</>
              ) : (
                "Gia hạn ngay"
              )}
            </Button>
          </div>
        )}

        {tab === "payment" && orderData && (
          <div className="space-y-4">
            {paymentStatus === "paid" ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="font-semibold text-green-700">Thanh toán thành công!</p>
                <p className="text-sm text-muted-foreground text-center">Tài khoản của bạn đã được kích hoạt. Đang tải lại...</p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Quét mã QR để thanh toán</p>
                  {orderData.qrCode && (
                    <div className="flex justify-center">
                      <img
                        src={orderData.qrCode}
                        alt="QR Code thanh toán"
                        className="w-48 h-48 rounded-lg border object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  {orderData.checkoutUrl && (
                    <a
                      href={orderData.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Mở trang thanh toán <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Nội dung CK:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold font-mono">{orderData.transferContent}</span>
                      <button
                        onClick={() => copyToClipboard(orderData.transferContent)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Sao chép"
                      >
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Số tiền:</span>
                    <span className="font-semibold text-primary">{formatAmount(orderData.amount)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Chuyển khoản đúng nội dung, hệ thống tự động kích hoạt trong vài giây
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={() => setTab("info")}>
                  Quay lại
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

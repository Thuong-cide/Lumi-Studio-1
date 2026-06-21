import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

type SubscriptionInfo = {
  status: string;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  daysRemaining: number | null;
};

export function SubscriptionBanner() {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/studio/subscription-info")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setInfo(data);
      })
      .catch(() => {});
  }, []);

  if (!info || dismissed) return null;
  if (info.status !== "trial" && info.status !== "active") return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    return format(parseISO(iso), "dd/MM/yyyy", { locale: vi });
  };

  if (info.status === "trial") {
    const days = info.daysRemaining ?? 0;
    return (
      <div className="relative flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <strong>Đang dùng thử</strong> — còn{" "}
          <strong>{days} ngày</strong>
          {info.trialEndsAt && <span className="text-amber-700/70 dark:text-amber-400/70"> (đến {formatDate(info.trialEndsAt)})</span>}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (info.status === "active") {
    return (
      <div className="relative flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          <strong>Đã kích hoạt</strong>
          {info.subscriptionExpiresAt && (
            <span className="text-green-700/70 dark:text-green-400/70"> — hết hạn ngày {formatDate(info.subscriptionExpiresAt)}</span>
          )}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto shrink-0 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

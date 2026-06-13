import { useState, useEffect } from "react";
import { Phone, X, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ContactConfig = {
  enabled: boolean;
  zalo: string;
  facebook: string;
  phone: string;
  telegram: string;
};

function ZaloIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#0068FF" />
      <text x="24" y="32" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="Arial, sans-serif">Z</text>
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

const CONTACT_ITEMS = [
  {
    key: "zalo" as const,
    label: "Zalo",
    icon: <ZaloIcon size={22} />,
    bg: "bg-[#0068FF]",
    hoverBg: "hover:bg-[#0055CC]",
    href: (val: string) => val.startsWith("http") ? val : `https://zalo.me/${val.replace(/\D/g, "")}`,
  },
  {
    key: "facebook" as const,
    label: "Facebook",
    icon: <FacebookIcon size={22} />,
    bg: "bg-[#1877F2]",
    hoverBg: "hover:bg-[#0e5fc0]",
    href: (val: string) => val.startsWith("http") ? val : `https://facebook.com/${val}`,
  },
  {
    key: "phone" as const,
    label: "Gọi điện",
    icon: <Phone size={20} strokeWidth={2.5} />,
    bg: "bg-emerald-500",
    hoverBg: "hover:bg-emerald-600",
    href: (val: string) => `tel:${val.replace(/\s/g, "")}`,
  },
  {
    key: "telegram" as const,
    label: "Telegram",
    icon: <TelegramIcon size={22} />,
    bg: "bg-[#229ED9]",
    hoverBg: "hover:bg-[#1a8bc2]",
    href: (val: string) => val.startsWith("http") ? val : `https://t.me/${val.replace("@", "")}`,
  },
];

export function FloatingContact() {
  const [config, setConfig] = useState<ContactConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/public/contact")
      .then(r => r.json())
      .then((data: ContactConfig) => setConfig(data))
      .catch(() => {});
  }, []);

  if (!config || !config.enabled) return null;

  const activeItems = CONTACT_ITEMS.filter(item => !!config[item.key]);
  if (activeItems.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && activeItems.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, scale: 0.5, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 16 }}
            transition={{ duration: 0.18, delay: (activeItems.length - 1 - i) * 0.05 }}
            className="flex items-center gap-2.5"
          >
            <span className="bg-background/90 backdrop-blur-sm text-foreground text-xs font-medium px-2.5 py-1 rounded-full shadow border border-border whitespace-nowrap">
              {item.label}
            </span>
            <a
              href={item.href(config[item.key])}
              target={item.key !== "phone" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className={`w-12 h-12 rounded-full ${item.bg} ${item.hoverBg} text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95`}
              onClick={() => setOpen(false)}
            >
              {item.icon}
            </a>
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(v => !v)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl transition-colors hover:bg-primary/90"
        aria-label="Liên hệ"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

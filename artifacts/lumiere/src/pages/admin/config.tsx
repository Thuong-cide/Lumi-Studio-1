import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Copy, Phone, MessageCircle, CreditCard } from "lucide-react";

type ContactConfig = {
  enabled: boolean;
  zalo: string;
  facebook: string;
  phone: string;
  telegram: string;
};

type ConfigData = {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  isConfigured: boolean;
  contact: ContactConfig;
};

type SettingsData = {
  settings: Record<string, string>;
  payosConfigured: boolean;
};

export default function AdminConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGoogle, setIsSavingGoogle] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  const [contactEnabled, setContactEnabled] = useState(false);
  const [contactZalo, setContactZalo] = useState("");
  const [contactFacebook, setContactFacebook] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTelegram, setContactTelegram] = useState("");

  const [settingsData, setSettingsData] = useState<SettingsData | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [trialDays, setTrialDays] = useState("15");
  const [isSavingTrialDays, setIsSavingTrialDays] = useState(false);
  const [payosClientId, setPayosClientId] = useState("");
  const [payosApiKey, setPayosApiKey] = useState("");
  const [payosChecksumKey, setPayosChecksumKey] = useState("");
  const [showPayosApiKey, setShowPayosApiKey] = useState(false);
  const [showPayosChecksumKey, setShowPayosChecksumKey] = useState(false);
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [isSavingPayos, setIsSavingPayos] = useState(false);

  const suggestedRedirectUri = `${window.location.origin}/api/auth/google/callback`;

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/config").then(r => r.json()),
      fetch("/api/admin/settings").then(r => r.json()),
    ]).then(([configData, settingsJson]: [ConfigData, SettingsData]) => {
      setConfig(configData);
      setClientId(configData.googleClientId || "");
      setClientSecret("");
      setRedirectUri(configData.googleRedirectUri || suggestedRedirectUri);
      if (configData.contact) {
        setContactEnabled(!!configData.contact.enabled);
        setContactZalo(configData.contact.zalo || "");
        setContactFacebook(configData.contact.facebook || "");
        setContactPhone(configData.contact.phone || "");
        setContactTelegram(configData.contact.telegram || "");
      }

      setSettingsData(settingsJson);
      setMonthlyPrice(settingsJson.settings?.monthly_price || "299000");
      setTrialDays(settingsJson.settings?.trial_days || "15");
      setPayosClientId(settingsJson.settings?.payos_client_id || "");
    }).catch(() => {
      setRedirectUri(suggestedRedirectUri);
    }).finally(() => setIsLoading(false));
  }, []);

  const handleSaveGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng điền đầy đủ thông tin", variant: "destructive" });
      return;
    }
    setIsSavingGoogle(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleClientId: clientId, googleClientSecret: clientSecret, googleRedirectUri: redirectUri }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Lỗi", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Đã lưu!", description: "Cấu hình Google API đã được cập nhật." });
      setConfig(prev => prev ? { ...prev, isConfigured: true, googleClientId: clientId, googleRedirectUri: redirectUri } : null);
      setClientSecret("");
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setIsSavingGoogle(false);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingContact(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: { enabled: contactEnabled, zalo: contactZalo, facebook: contactFacebook, phone: contactPhone, telegram: contactTelegram } }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Lỗi", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Đã lưu!", description: "Cấu hình liên hệ đã được cập nhật." });
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setIsSavingContact(false);
    }
  };

  const saveSettingKey = async (key: string, value: string) => {
    const res = await fetch(`/api/admin/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Lỗi lưu cài đặt");
    }
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(monthlyPrice, 10);
    if (isNaN(price) || price <= 0) {
      toast({ title: "Lỗi", description: "Giá không hợp lệ", variant: "destructive" });
      return;
    }
    setIsSavingPrice(true);
    try {
      await saveSettingKey("monthly_price", String(price));
      toast({ title: "Đã lưu!", description: "Giá thuê bao đã được cập nhật." });
      setSettingsData(prev => prev ? { ...prev, settings: { ...prev.settings, monthly_price: String(price) } } : null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi kết nối";
      toast({ title: "Lỗi", description: msg, variant: "destructive" });
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handleSaveTrialDays = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(trialDays, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      toast({ title: "Lỗi", description: "Số ngày dùng thử phải từ 1 đến 365", variant: "destructive" });
      return;
    }
    setIsSavingTrialDays(true);
    try {
      await saveSettingKey("trial_days", String(days));
      toast({ title: "Đã lưu!", description: `Studio mới đăng ký sẽ có ${days} ngày dùng thử.` });
      setSettingsData(prev => prev ? { ...prev, settings: { ...prev.settings, trial_days: String(days) } } : null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi kết nối";
      toast({ title: "Lỗi", description: msg, variant: "destructive" });
    } finally {
      setIsSavingTrialDays(false);
    }
  };

  const handleSavePayos = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPayos(true);
    try {
      const updates: Promise<void>[] = [];
      if (payosClientId.trim()) {
        updates.push(saveSettingKey("payos_client_id", payosClientId.trim()));
      }
      if (payosApiKey.trim()) {
        updates.push(saveSettingKey("payos_api_key", payosApiKey.trim()));
      }
      if (payosChecksumKey.trim()) {
        updates.push(saveSettingKey("payos_checksum_key", payosChecksumKey.trim()));
      }
      if (updates.length === 0) {
        toast({ title: "Không có thay đổi", description: "Vui lòng nhập ít nhất một giá trị mới." });
        return;
      }
      await Promise.all(updates);
      toast({ title: "Đã lưu!", description: "Cấu hình PayOS đã được cập nhật." });

      const res = await fetch("/api/admin/settings").then(r => r.json());
      setSettingsData(res);
      setPayosApiKey("");
      setPayosChecksumKey("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi kết nối";
      toast({ title: "Lỗi", description: msg, variant: "destructive" });
    } finally {
      setIsSavingPayos(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Đã sao chép", description: text });
  };

  const formatPrice = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return "";
    return new Intl.NumberFormat("vi-VN").format(num) + " ₫ / tháng";
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Cấu hình hệ thống</h1>
        <p className="text-muted-foreground mt-1">Thiết lập Google API, thanh toán PayOS và thông tin liên hệ.</p>
      </div>

      {/* ── PAYOS SECTION ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Thanh toán PayOS</h2>
          {settingsData?.payosConfigured ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-700">
              <CheckCircle2 className="h-3 w-3 mr-1" />Đã cấu hình
            </Badge>
          ) : (
            <Badge variant="destructive" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 border-red-200">
              <AlertCircle className="h-3 w-3 mr-1" />Chưa cấu hình
            </Badge>
          )}
        </div>

        {/* Giá thuê bao */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Giá thuê bao</CardTitle>
            <CardDescription>Giá áp dụng khi studio gia hạn tài khoản</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePrice} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthly-price">Giá hàng tháng (VNĐ)</Label>
                <Input
                  id="monthly-price"
                  type="number"
                  min="1000"
                  placeholder="299000"
                  value={monthlyPrice}
                  onChange={e => setMonthlyPrice(e.target.value)}
                />
                {monthlyPrice && !isNaN(parseInt(monthlyPrice)) && (
                  <p className="text-sm text-muted-foreground">Preview: <strong>{formatPrice(monthlyPrice)}</strong></p>
                )}
              </div>
              <Button type="submit" disabled={isSavingPrice} variant="outline">
                {isSavingPrice ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu giá"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Số ngày dùng thử */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Thời gian dùng thử</CardTitle>
            <CardDescription>Số ngày dùng thử miễn phí áp dụng cho studio mới đăng ký</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveTrialDays} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trial-days">Số ngày dùng thử</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="trial-days"
                    type="number"
                    min="1"
                    max="365"
                    placeholder="15"
                    value={trialDays}
                    onChange={e => setTrialDays(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">ngày</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Studio mới đăng ký sẽ có <strong>{trialDays || "15"} ngày</strong> sử dụng miễn phí trước khi cần thanh toán.
                </p>
              </div>
              <Button type="submit" disabled={isSavingTrialDays} variant="outline">
                {isSavingTrialDays ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu cài đặt"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PayOS Credentials */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Thông tin cấu hình PayOS</CardTitle>
            <CardDescription>
              Lấy credentials tại{" "}
              <a href="https://business.payos.vn" target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5">
                business.payos.vn <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePayos} className="space-y-4">
              {/* Client ID */}
              <div className="space-y-2">
                <Label htmlFor="payos-client-id">Client ID</Label>
                <div className="relative">
                  <Input
                    id="payos-client-id"
                    placeholder={settingsData?.settings?.payos_client_id ? settingsData.settings.payos_client_id : "Nhập Client ID"}
                    value={payosClientId}
                    onChange={e => setPayosClientId(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  {payosClientId && (
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(payosClientId)}>
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {settingsData?.settings?.payos_client_id && (
                  <p className="text-xs text-muted-foreground">Đang dùng: {settingsData.settings.payos_client_id}</p>
                )}
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label htmlFor="payos-api-key">Api Key</Label>
                <div className="relative">
                  <Input
                    id="payos-api-key"
                    type={showPayosApiKey ? "text" : "password"}
                    placeholder={settingsData?.settings?.payos_api_key || "Nhập Api Key mới để cập nhật"}
                    value={payosApiKey}
                    onChange={e => setPayosApiKey(e.target.value)}
                    className="font-mono text-sm pr-16"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {payosApiKey && (
                      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(payosApiKey)}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowPayosApiKey(v => !v)}>
                      {showPayosApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {settingsData?.settings?.payos_api_key && (
                  <p className="text-xs text-muted-foreground">Đang dùng: {settingsData.settings.payos_api_key}</p>
                )}
              </div>

              {/* Checksum Key */}
              <div className="space-y-2">
                <Label htmlFor="payos-checksum-key">Checksum Key</Label>
                <div className="relative">
                  <Input
                    id="payos-checksum-key"
                    type={showPayosChecksumKey ? "text" : "password"}
                    placeholder={settingsData?.settings?.payos_checksum_key || "Nhập Checksum Key mới để cập nhật"}
                    value={payosChecksumKey}
                    onChange={e => setPayosChecksumKey(e.target.value)}
                    className="font-mono text-sm pr-16"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {payosChecksumKey && (
                      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(payosChecksumKey)}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowPayosChecksumKey(v => !v)}>
                      {showPayosChecksumKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {settingsData?.settings?.payos_checksum_key && (
                  <p className="text-xs text-muted-foreground">Đang dùng: {settingsData.settings.payos_checksum_key}</p>
                )}
              </div>

              <Button type="submit" disabled={isSavingPayos} className="w-full">
                {isSavingPayos ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu cấu hình PayOS"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* ── GOOGLE OAUTH ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Google Drive API</h2>

        <Card className={config?.isConfigured
          ? "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20"
          : "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"}>
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            {config?.isConfigured ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300">Đã cấu hình Google OAuth</p>
                  <p className="text-sm text-green-700/70 dark:text-green-400/70">Studio có thể kết nối Google Drive để upload ảnh.</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Chưa cấu hình Google API</p>
                  <p className="text-sm text-amber-700/70 dark:text-amber-400/70">Tính năng Google Drive chưa hoạt động.</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Cách lấy Google API credentials</CardTitle>
            <CardDescription>Thực hiện các bước sau trong Google Cloud Console</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ol className="list-decimal list-inside space-y-2">
              <li>Vào <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="h-3 w-3" /></a></li>
              <li>Tạo project mới hoặc chọn project có sẵn</li>
              <li>Bật <strong>Google Drive API</strong> trong Library</li>
              <li>Vào <strong>Credentials → Create Credentials → OAuth 2.0 Client ID</strong></li>
              <li>Chọn loại ứng dụng: <strong>Web application</strong></li>
              <li>Thêm <strong>Authorized redirect URI</strong> bên dưới vào Google Console:</li>
            </ol>
            <div className="mt-3 flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5 font-mono text-xs break-all">
              <span className="flex-1">{suggestedRedirectUri}</span>
              <button onClick={() => copyToClipboard(suggestedRedirectUri)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Thông tin xác thực</CardTitle>
            <CardDescription>Nhập Client ID và Client Secret từ Google Cloud Console</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveGoogle} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="clientId">Google Client ID</Label>
                <Input id="clientId" placeholder="123456789-xxxxxxxxxxxx.apps.googleusercontent.com" value={clientId} onChange={e => setClientId(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Google Client Secret</Label>
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={showSecret ? "text" : "password"}
                    placeholder={config?.isConfigured ? "Nhập secret mới để cập nhật" : "GOCSPX-xxxxxxxxxxxx"}
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(v => !v)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {config?.isConfigured && <p className="text-xs text-muted-foreground">Secret hiện tại đã được lưu. Để trống nếu không muốn thay đổi.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="redirectUri">Redirect URI</Label>
                <Input id="redirectUri" placeholder={suggestedRedirectUri} value={redirectUri} onChange={e => setRedirectUri(e.target.value)} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">URI này phải khớp với URI đã đăng ký trong Google Cloud Console.</p>
              </div>
              <Button type="submit" disabled={isSavingGoogle || (!clientSecret && !config?.isConfigured)} className="w-full">
                {isSavingGoogle ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu cấu hình Google"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* ── CONTACT BUBBLE ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Nút liên hệ nổi</h2>
        <p className="text-sm text-muted-foreground -mt-2">
          Hiển thị bong bóng liên hệ ở góc phải trang gallery công khai. Chỉ những kênh có điền thông tin mới xuất hiện.
        </p>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-medium">Cài đặt liên hệ</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="contact-enabled" className="text-sm text-muted-foreground">
                  {contactEnabled ? "Đang hiển thị" : "Đang ẩn"}
                </Label>
                <Switch id="contact-enabled" checked={contactEnabled} onCheckedChange={setContactEnabled} />
              </div>
            </div>
            <CardDescription>Điền link hoặc số điện thoại. Để trống kênh nào sẽ ẩn kênh đó.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveContact} className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#0068FF] flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">Z</span>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="contact-zalo" className="text-sm">Zalo</Label>
                    <Input id="contact-zalo" placeholder="Số điện thoại hoặc https://zalo.me/..." value={contactZalo} onChange={e => setContactZalo(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="contact-facebook" className="text-sm">Facebook</Label>
                    <Input id="contact-facebook" placeholder="https://facebook.com/yourstudio" value={contactFacebook} onChange={e => setContactFacebook(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <Phone size={17} className="text-white" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="contact-phone" className="text-sm">Điện thoại</Label>
                    <Input id="contact-phone" placeholder="0901 234 567" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#229ED9] flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="contact-telegram" className="text-sm">Telegram</Label>
                    <Input id="contact-telegram" placeholder="@yourstudio hoặc https://t.me/..." value={contactTelegram} onChange={e => setContactTelegram(e.target.value)} />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={isSavingContact} className="w-full mt-2">
                {isSavingContact ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu cài đặt liên hệ"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

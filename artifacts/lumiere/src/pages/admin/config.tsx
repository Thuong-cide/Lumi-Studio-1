import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Copy } from "lucide-react";

type ConfigData = {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  isConfigured: boolean;
};

export default function AdminConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  const suggestedRedirectUri = `${window.location.origin}/api/auth/google/callback`;

  useEffect(() => {
    fetch("/api/admin/config")
      .then(r => r.json())
      .then((data: ConfigData) => {
        setConfig(data);
        setClientId(data.googleClientId || "");
        setClientSecret("");
        setRedirectUri(data.googleRedirectUri || suggestedRedirectUri);
      })
      .catch(() => {
        setRedirectUri(suggestedRedirectUri);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng điền đầy đủ thông tin", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleClientId: clientId,
          googleClientSecret: clientSecret,
          googleRedirectUri: redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Lỗi", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Đã lưu!", description: "Cấu hình Google API đã được cập nhật và lưu vào database." });
      setConfig(prev => prev ? { ...prev, isConfigured: true, googleClientId: clientId, googleRedirectUri: redirectUri } : null);
      setClientSecret("");
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Đã sao chép", description: text });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Cấu hình Google API</h1>
        <p className="text-muted-foreground mt-1">
          Thông tin được lưu vào database — không mất khi triển khai sang server mới.
        </p>
      </div>

      {/* Trạng thái hiện tại */}
      <Card className={config?.isConfigured ? "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20" : "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"}>
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
                <p className="text-sm text-amber-700/70 dark:text-amber-400/70">Tính năng Google Drive chưa hoạt động. Hãy nhập thông tin bên dưới.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Hướng dẫn */}
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

      {/* Form cấu hình */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Thông tin xác thực</CardTitle>
          <CardDescription>Nhập Client ID và Client Secret từ Google Cloud Console</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="clientId">Google Client ID</Label>
              <Input
                id="clientId"
                placeholder="123456789-xxxxxxxxxxxx.apps.googleusercontent.com"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="font-mono text-sm"
              />
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
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(v => !v)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {config?.isConfigured && (
                <p className="text-xs text-muted-foreground">Secret hiện tại đã được lưu. Để trống nếu không muốn thay đổi.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="redirectUri">Redirect URI</Label>
              <Input
                id="redirectUri"
                placeholder={suggestedRedirectUri}
                value={redirectUri}
                onChange={e => setRedirectUri(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">URI này phải khớp với URI đã đăng ký trong Google Cloud Console.</p>
            </div>

            <Button
              type="submit"
              disabled={isSaving || (!clientSecret && !config?.isConfigured)}
              className="w-full"
            >
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu cấu hình vào database"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

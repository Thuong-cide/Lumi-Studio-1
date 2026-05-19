import { useGetGoogleAuthUrl, getGetGoogleAuthUrlQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

export default function StudioDrive() {
  const { data: authUrl, isLoading: isLoadingUrl } = useGetGoogleAuthUrl({
    query: { queryKey: getGetGoogleAuthUrlQueryKey() }
  });
  
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isConnected = me?.studio?.googleDriveConnected;

  const [status, setStatus] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") setStatus("success");
    if (params.get("error")) setStatus("error");
  }, []);

  const handleConnect = () => {
    if (authUrl?.url) {
      window.location.href = authUrl.url;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Google Drive</h1>
        </div>
      </div>

      {status === "success" && (
        <div className="bg-success/10 border border-success/30 text-success p-4 rounded-lg flex items-center">
          <CheckCircle2 className="h-5 w-5 mr-3" />
          Kết nối Google Drive thành công! Bạn đã có thể bắt đầu tải ảnh lên.
        </div>
      )}

      {status === "error" && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 mr-3" />
          Kết nối thất bại. Vui lòng thử lại.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Lưu trữ ảnh</CardTitle>
          <CardDescription>
            Lumière sử dụng Google Drive của bạn để lưu trữ ảnh an toàn với chi phí bằng 0.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-6 rounded-lg text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-8 h-8">
                <path fill="#FFC107" d="M17 5.8L5 26.6l5.9 10.2L23 16z"/>
                <path fill="#1976D2" d="M30.9 5.8h-14l11.9 20.8 6-10.4z"/>
                <path fill="#4CAF50" d="M37 16.2H13.1l-5.9 10.4L17 47h24z"/>
              </svg>
            </div>
            
            <div>
              <h3 className="font-medium text-lg mb-1">
                {isConnected ? "Google Drive Đã Kết Nối" : "Chưa Kết Nối Google Drive"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                {isConnected 
                  ? "Tài khoản của bạn đã được kết nối. Khi bạn tải ảnh lên Album, ảnh sẽ được lưu trữ tự động vào một thư mục Lumiere trên Drive của bạn."
                  : "Bạn cần kết nối với Google Drive để hệ thống có nơi lưu trữ ảnh bạn tải lên."}
              </p>
            </div>

            <Button 
              size="lg" 
              onClick={handleConnect} 
              disabled={isLoadingUrl}
              className={isConnected ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground hover:bg-primary/90"}
            >
              {isLoadingUrl ? "Đang chuẩn bị..." : isConnected ? "Kết nối lại" : "Kết nối Google Drive"}
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground pt-4 border-t space-y-2">
            <h4 className="font-medium text-foreground">Cách hoạt động:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Chúng tôi chỉ tạo một thư mục "Lumiere_Photos" trên Drive của bạn.</li>
              <li>Hệ thống chỉ có quyền đọc/ghi vào thư mục này, KHÔNG THỂ truy cập các tệp cá nhân khác của bạn.</li>
              <li>Bạn không cần trả phí lưu trữ cho Lumière, chỉ phụ thuộc vào dung lượng Drive của bạn.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

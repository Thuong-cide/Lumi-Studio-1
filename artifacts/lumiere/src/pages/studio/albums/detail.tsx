import { useState, useRef } from "react";
import {
  useGetAlbum,
  getGetAlbumQueryKey,
  useListPhotos,
  getListPhotosQueryKey,
  useDeletePhoto,
  useUpdateAlbumNotification,
  useSendAlbumNotification,
  usePublishAlbum,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { AlbumDeliverablesSection } from "@/components/album-deliverables-section";
import { useLocation, useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Trash2, Users, Link as LinkIcon, Send, Globe, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";

const phoneSchema = z.object({
  customerPhone: z
    .string()
    .refine((v) => v === "" || /^0\d{9}$/.test(v), {
      message: "Số điện thoại phải có 10 số, bắt đầu bằng 0",
    }),
});

export default function AlbumDetail() {
  const { id } = useParams();
  const albumId = id || "";
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: albumData, isLoading: isLoadingAlbum } = useGetAlbum(albumId, {
    query: { enabled: !!albumId, queryKey: getGetAlbumQueryKey(albumId) },
  });
  const { data: photosData, isLoading: isLoadingPhotos } = useListPhotos(albumId, {
    query: { enabled: !!albumId, queryKey: getListPhotosQueryKey(albumId) },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const deletePhoto = useDeletePhoto();
  const updateNotif = useUpdateAlbumNotification();
  const sendNotif = useSendAlbumNotification();
  const publishAlbum = usePublishAlbum();

  const album = albumData?.album;
  const photos = photosData?.photos || [];
  const hasWebhook = !!me?.studio?.n8nWebhookUrl;

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    values: {
      customerPhone: album?.customerPhone ?? "",
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("file", files[i]);
      formData.append("albumId", albumId);
      try {
        const response = await fetch("/api/drive/upload", { method: "POST", body: formData });
        if (response.ok) successCount++; else errorCount++;
      } catch { errorCount++; }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey(albumId) });
    if (successCount > 0) toast({ title: `Đã tải lên ${successCount} ảnh thành công` });
    if (errorCount > 0) toast({ title: "Lỗi tải ảnh", description: `Không thể tải lên ${errorCount} ảnh`, variant: "destructive" });
  };

  const handleDeletePhoto = (photoId: string) => {
    deletePhoto.mutate(
      { id: albumId, photoId },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey(albumId) }); toast({ title: "Đã xóa ảnh" }); },
        onError: () => toast({ title: "Lỗi", description: "Không thể xóa ảnh", variant: "destructive" }),
      }
    );
  };

  const handleSavePhone = (values: z.infer<typeof phoneSchema>) => {
    updateNotif.mutate(
      { id: albumId, data: { customerPhone: values.customerPhone || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) });
          toast({ title: "Đã lưu số điện thoại" });
        },
        onError: (err) => {
          toast({ title: "Lỗi", description: (err.data as { error?: string })?.error || err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleSendNow = () => {
    sendNotif.mutate(
      { id: albumId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) });
          toast({ title: "Đã gửi link album cho khách!" });
        },
        onError: (err) => {
          const msg = (err.data as { error?: string })?.error || err.message || "Không thể gửi webhook";
          toast({ title: "Gửi thất bại", description: msg, variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) });
        },
      }
    );
  };

  const handlePublish = () => {
    publishAlbum.mutate(
      { id: albumId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlbumQueryKey(albumId) });
          toast({ title: "Album đã được công khai" });
        },
        onError: (err) => {
          toast({ title: "Lỗi", description: (err.data as { error?: string })?.error || err.message, variant: "destructive" });
        },
      }
    );
  };

  if (isLoadingAlbum) return <div className="animate-pulse p-8 font-serif text-xl">Đang tải...</div>;
  if (!album) return <div className="p-8 font-serif text-xl">Không tìm thấy album</div>;

  const webhookSentAt = album.webhookSentAt ? new Date(album.webhookSentAt) : null;
  const currentPhone = phoneForm.watch("customerPhone");
  const canSend = hasWebhook && !!currentPhone;

  return (
    <div className="space-y-8 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/dashboard/albums">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-serif font-bold text-foreground">{album.title}</h1>
              {album.isPublic ? (
                <Badge variant="default" className="bg-success text-white">Công khai</Badge>
              ) : (
                <Badge variant="secondary">Riêng tư</Badge>
              )}
            </div>
            {album.description && (
              <p className="text-muted-foreground mt-1 max-w-2xl">{album.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/dashboard/albums/${album.id}/selections`}>
              <Button variant="outline" className="shadow-sm">
                <Users className="mr-2 h-4 w-4" />
                Khách chọn ({album.selectionCount || 0})
              </Button>
            </Link>
            {!album.isPublic && (
              <Button
                variant="outline"
                className="shadow-sm border-success text-success hover:bg-success/10"
                onClick={handlePublish}
                disabled={publishAlbum.isPending}
              >
                <Globe className="mr-2 h-4 w-4" />
                {publishAlbum.isPending ? "Đang xử lý..." : "Công khai album"}
              </Button>
            )}
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Đang tải lên..." : "Tải ảnh lên"}
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 border-b border-border pb-4 text-sm">
        {album.isPublic && (
          <div className="flex items-center gap-2 text-primary font-medium">
            <LinkIcon className="h-4 w-4" />
            <a href={`/album/${album.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Link xem ảnh khách hàng
            </a>
          </div>
        )}
      </div>

      <div className="pt-4">
        {isLoadingPhotos ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-muted rounded-xl bg-card/30">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-serif font-medium text-lg mb-2">Chưa có ảnh nào</h3>
            <p className="text-muted-foreground mb-4">Tải ảnh lên để khách hàng bắt đầu lựa chọn.</p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Tải ảnh ngay</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative aspect-square rounded-lg overflow-hidden bg-muted border"
              >
                <img
                  src={`/api/drive/proxy/${photo.driveFileId}`}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="rounded-full shadow-lg"
                    onClick={() => handleDeletePhoto(photo.id)}
                    disabled={deletePhoto.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Zalo Notification Section */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            Thông báo Zalo cho khách
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!hasWebhook && (
            <div className="text-sm text-muted-foreground bg-muted/50 border rounded-lg p-3">
              Bạn chưa cấu hình n8n Webhook URL.{" "}
              <Link href="/dashboard/settings" className="text-primary underline underline-offset-2">
                Cấu hình ngay →
              </Link>
            </div>
          )}

          {webhookSentAt && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${
              album.webhookLastStatus === "success"
                ? "bg-success/10 border-success/20 text-success"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}>
              {album.webhookLastStatus === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>
                {album.webhookLastStatus === "success" ? "Đã gửi thành công" : "Gửi thất bại"} lúc{" "}
                {webhookSentAt.toLocaleString("vi-VN")}
              </span>
            </div>
          )}

          <Form {...phoneForm}>
            <form onSubmit={phoneForm.handleSubmit(handleSavePhone)} className="space-y-4">
              <FormField
                control={phoneForm.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số điện thoại khách hàng</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0987654321"
                        maxLength={10}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>10 số, bắt đầu bằng 0</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={updateNotif.isPending}
                >
                  {updateNotif.isPending ? "Đang lưu..." : "Lưu số điện thoại"}
                </Button>
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleSendNow}
                  disabled={!canSend || sendNotif.isPending}
                  title={!hasWebhook ? "Chưa cấu hình n8n Webhook URL" : !currentPhone ? "Chưa nhập số điện thoại" : ""}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sendNotif.isPending ? "Đang gửi..." : "Gửi link cho khách ngay"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlbumDeliverablesSection
        albumId={albumId}
        deliverableRootFolderUrl={album?.deliverableRootFolderUrl}
      />
    </div>
  );
}

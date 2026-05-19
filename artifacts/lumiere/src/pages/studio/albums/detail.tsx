import { useState, useRef } from "react";
import { useGetAlbum, getGetAlbumQueryKey, useListPhotos, getListPhotosQueryKey, useDeletePhoto } from "@workspace/api-client-react";
import { useLocation, useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Trash2, Settings, Users, Link as LinkIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export default function AlbumDetail() {
  const { id } = useParams();
  const albumId = id || "";
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: albumData, isLoading: isLoadingAlbum } = useGetAlbum(albumId, {
    query: {
      enabled: !!albumId,
      queryKey: getGetAlbumQueryKey(albumId),
    }
  });

  const { data: photosData, isLoading: isLoadingPhotos } = useListPhotos(albumId, {
    query: {
      enabled: !!albumId,
      queryKey: getListPhotosQueryKey(albumId),
    }
  });

  const deletePhoto = useDeletePhoto();

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
        const response = await fetch("/api/drive/upload", {
          method: "POST",
          body: formData,
        });
        
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey(albumId) });
    
    if (successCount > 0) {
      toast({ title: `Đã tải lên ${successCount} ảnh thành công` });
    }
    if (errorCount > 0) {
      toast({ 
        title: "Lỗi tải ảnh", 
        description: `Không thể tải lên ${errorCount} ảnh`,
        variant: "destructive"
      });
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    deletePhoto.mutate(
      { id: albumId, photoId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey(albumId) });
          toast({ title: "Đã xóa ảnh" });
        },
        onError: () => {
          toast({ title: "Lỗi", description: "Không thể xóa ảnh", variant: "destructive" });
        }
      }
    );
  };

  if (isLoadingAlbum) return <div className="animate-pulse p-8 font-serif text-xl">Đang tải...</div>;
  if (!albumData) return <div className="p-8 font-serif text-xl">Không tìm thấy album</div>;

  const album = albumData.album;
  const photos = photosData?.photos || [];

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
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/albums/${album.id}/selections`}>
              <Button variant="outline" className="shadow-sm">
                <Users className="mr-2 h-4 w-4" />
                Khách chọn ({album.selectionCount || 0})
              </Button>
            </Link>
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
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Tải ảnh ngay
            </Button>
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
    </div>
  );
}

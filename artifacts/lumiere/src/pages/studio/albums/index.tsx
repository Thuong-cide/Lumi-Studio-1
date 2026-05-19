import { useState } from "react";
import { useListAlbums, getListAlbumsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Image as ImageIcon, Users, Lock, Globe, Link as LinkIcon, Check, QrCode, Download } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";

type Album = { id: string; slug: string; title: string };

export default function StudioAlbums() {
  const { data, isLoading } = useListAlbums({
    query: { queryKey: getListAlbumsQueryKey() }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrAlbum, setQrAlbum] = useState<Album | null>(null);

  function copyLink(e: React.MouseEvent, album: { id: string; slug: string }) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(
      `${window.location.origin}/album/${album.slug}`
    ).then(() => {
      setCopiedId(album.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function openQr(e: React.MouseEvent, album: Album) {
    e.preventDefault();
    e.stopPropagation();
    setQrAlbum(album);
  }

  function downloadQr() {
    if (!qrAlbum) return;
    const canvas = document.getElementById("qr-download-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${qrAlbum.slug}.png`;
    a.click();
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const qrValue = qrAlbum ? `${window.location.origin}/album/${qrAlbum.slug}` : "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Thư viện Album</h1>
          <p className="text-muted-foreground mt-2">Quản lý các bộ ảnh và lựa chọn của khách hàng.</p>
        </div>
        <Link href="/dashboard/albums/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Tạo Album mới
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-xl bg-card border animate-pulse" />
          ))}
        </div>
      ) : data?.albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-xl bg-card/50">
          <ImageIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-serif font-medium text-foreground mb-2">Chưa có Album nào</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            Tạo album đầu tiên của bạn để tải ảnh lên và chia sẻ với khách hàng.
          </p>
          <Link href="/dashboard/albums/new">
            <Button variant="outline">Bắt đầu ngay</Button>
          </Link>
        </div>
      ) : (
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {data?.albums.map((album) => (
            <motion.div key={album.id} variants={item}>
              <Link href={`/dashboard/albums/${album.id}`}>
                <Card className="h-full cursor-pointer hover-elevate no-default-hover-elevate hover:shadow-lg transition-all hover:border-primary/50 group overflow-hidden">
                  <CardContent className="p-0 flex flex-col h-full">
                    <div className="h-32 bg-muted flex items-center justify-center border-b relative">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30 group-hover:text-primary/30 transition-colors" />
                      <div className="absolute top-3 right-3">
                        {album.isPublic ? (
                          <div className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium text-foreground flex items-center shadow-sm">
                            <Globe className="h-3 w-3 mr-1" /> Công khai
                          </div>
                        ) : (
                          <div className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium text-muted-foreground flex items-center shadow-sm">
                            <Lock className="h-3 w-3 mr-1" /> Riêng tư
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-serif font-bold text-xl group-hover:text-primary transition-colors line-clamp-1">
                        {album.title}
                      </h3>
                      {album.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {album.description}
                        </p>
                      )}
                      
                      <div className="mt-auto pt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center">
                            <ImageIcon className="h-4 w-4 mr-1" />
                            {album.photoCount || 0}
                          </span>
                          <span className="flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            {album.selectionCount || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{format(new Date(album.createdAt), "dd/MM/yyyy")}</span>
                          <button
                            onClick={(e) => openQr(e, album)}
                            title="Xem QR Code"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all bg-muted/60 text-muted-foreground hover:bg-accent/10 hover:text-accent"
                          >
                            <QrCode size={13} />
                          </button>
                          <button
                            onClick={(e) => copyLink(e, album)}
                            title="Copy link khách chọn ảnh"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              copiedId === album.id
                                ? 'bg-green-500/15 text-green-600'
                                : 'bg-muted/60 text-muted-foreground hover:bg-accent/10 hover:text-accent'
                            }`}
                          >
                            {copiedId === album.id ? <Check size={13} /> : <LinkIcon size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Dialog open={!!qrAlbum} onOpenChange={(open) => { if (!open) setQrAlbum(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">QR Code — {qrAlbum?.title}</DialogTitle>
            <DialogDescription>
              Khách hàng quét mã này để mở album và chọn ảnh.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-6 py-2">
            <div className="p-4 bg-white rounded-xl shadow-inner border">
              <QRCodeSVG
                value={qrValue}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>

            <p className="text-xs text-muted-foreground text-center break-all px-2">
              {qrValue}
            </p>

            <div className="hidden">
              <QRCodeCanvas
                id="qr-download-canvas"
                value={qrValue}
                size={512}
                level="M"
                includeMargin={true}
              />
            </div>

            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={downloadQr}
              >
                <Download className="h-4 w-4 mr-2" />
                Tải PNG
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(e) => {
                  if (qrAlbum) copyLink(e as unknown as React.MouseEvent, qrAlbum);
                  setQrAlbum(null);
                }}
              >
                {copiedId === qrAlbum?.id ? <Check className="h-4 w-4 mr-2" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                {copiedId === qrAlbum?.id ? 'Đã copy!' : 'Copy link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

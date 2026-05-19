import { useState } from "react";
import { useListAlbums, getListAlbumsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Image as ImageIcon, Users, Lock, Globe, Link as LinkIcon, Check } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function StudioAlbums() {
  const { data, isLoading } = useListAlbums({
    query: { queryKey: getListAlbumsQueryKey() }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
                      {/* Thumbnail logic would go here if we had one pre-computed, fallback to icon */}
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{format(new Date(album.createdAt), "dd/MM/yyyy")}</span>
                          <button
                            onClick={(e) => copyLink(e, album)}
                            title="Copy link khách chọn ảnh"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              copiedId === album.id
                                ? 'bg-success/15 text-success'
                                : 'bg-sand text-warm-gray hover:bg-accent/10 hover:text-accent'
                            }`}
                          >
                            {copiedId === album.id
                              ? <Check size={13} />
                              : <LinkIcon size={13} />}
                            {copiedId === album.id ? 'Đã copy!' : 'Copy link'}
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
    </div>
  );
}

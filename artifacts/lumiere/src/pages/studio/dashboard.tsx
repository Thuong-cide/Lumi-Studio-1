import { useGetMe, getGetMeQueryKey, useListAlbums, getListAlbumsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Image as ImageIcon, Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export default function StudioDashboard() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: albumsData, isLoading } = useListAlbums({
    query: { queryKey: getListAlbumsQueryKey() }
  });

  const albums = albumsData?.albums || [];
  const recentAlbums = albums.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">
            Xin chào, {me?.studio?.name}
          </h1>
          <p className="text-muted-foreground mt-2">
            Chào mừng bạn trở lại không gian làm việc.
          </p>
        </div>
        <Link href="/dashboard/albums/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Tạo Album mới
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 bg-card hover-elevate no-default-hover-elevate hover:shadow-md transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              <ImageIcon className="mr-2 h-4 w-4" />
              Tổng số Album
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif font-bold text-foreground">
              {isLoading ? "-" : albums.length}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 hover-elevate no-default-hover-elevate hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-serif font-bold">Album gần đây</CardTitle>
            <Link href="/dashboard/albums" className="text-sm text-primary hover:underline flex items-center">
              Xem tất cả <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse text-muted-foreground">Đang tải...</div>
            ) : recentAlbums.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg border-muted">
                Bạn chưa có album nào.
              </div>
            ) : (
              <div className="space-y-4">
                {recentAlbums.map((album) => (
                  <Link key={album.id} href={`/dashboard/albums/${album.id}`}>
                    <div className="flex items-center justify-between p-3 -mx-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
                      <div>
                        <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {album.title}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          <span>{format(new Date(album.createdAt), "dd/MM/yyyy")}</span>
                          <span>•</span>
                          <span>{album.photoCount || 0} ảnh</span>
                          <span>•</span>
                          <span>{album.selectionCount || 0} lượt chọn</span>
                        </div>
                      </div>
                      <Badge variant={album.isPublic ? "default" : "secondary"} className={album.isPublic ? "bg-accent/20 text-accent hover:bg-accent/30" : ""}>
                        {album.isPublic ? "Công khai" : "Riêng tư"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Add Badge component locally if not imported
import { Badge } from "@/components/ui/badge";

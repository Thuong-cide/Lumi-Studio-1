import { useListSelections, getListSelectionsQueryKey, useGetAlbum, getGetAlbumQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, MessageSquare, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo, useState } from "react";
import LocAnh from "@/pages/studio/loc-anh";
type Selection = {
  id: string;
  albumId: string;
  photoId: string;
  customerName: string;
  note?: string | null;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
  photo?: {
    id: string;
    driveFileId: string;
    filename: string;
    mimeType: string;
    thumbnailUrl?: string | null;
  } | null;
};

export default function AlbumSelections() {
  const { id } = useParams();
  const albumId = id || "";
  const [activeTab, setActiveTab] = useState<"selections" | "loc-anh">("selections");

  const { data: albumData } = useGetAlbum(albumId, {
    query: { enabled: !!albumId, queryKey: getGetAlbumQueryKey(albumId) }
  });

  const { data: selectionsData, isLoading } = useListSelections(albumId, {
    query: { enabled: !!albumId, queryKey: getListSelectionsQueryKey(albumId) }
  });

  const groupedSelections = useMemo(() => {
    if (!selectionsData?.selections) return {};
    return selectionsData.selections.reduce((acc, selection) => {
      const name = selection.customerName;
      if (!acc[name]) acc[name] = [];
      acc[name].push(selection);
      return acc;
    }, {} as Record<string, Selection[]>);
  }, [selectionsData]);

  const selectedFileNames = useMemo(() => {
    if (!selectionsData?.selections) return [];
    return selectionsData.selections
      .map(sel => {
        const filename = sel.photo?.filename || "";
        const parts = filename.split(".");
        parts.pop();
        return parts.join(".");
      })
      .filter(Boolean);
  }, [selectionsData]);

  const handleExportText = () => {
    if (!selectionsData?.selections) return;
    
    let text = `Lựa chọn từ album: ${albumData?.album?.title || "Không tên"}\n\n`;
    
    Object.entries(groupedSelections).forEach(([customer, selections]) => {
      text += `Khách hàng: ${customer} (${selections.length} ảnh)\n`;
      selections.forEach(sel => {
        text += `- ${sel.photo?.filename || sel.photoId}`;
        if (sel.note) text += ` (Ghi chú: ${sel.note})`;
        text += `\n`;
      });
      text += `\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selections-${albumId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-8 font-serif">Đang tải...</div>;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href={`/dashboard/albums/${albumId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Lựa chọn của khách</h1>
            <p className="text-muted-foreground mt-1">{albumData?.album?.title}</p>
          </div>
          {activeTab === "selections" && (
            <Button variant="outline" onClick={handleExportText} className="shadow-sm">
              <Download className="mr-2 h-4 w-4" />
              Xuất danh sách
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("selections")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "selections"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Ảnh đã chọn
          {selectionsData?.selections?.length ? (
            <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded-full">
              {selectionsData.selections.length}
            </span>
          ) : null}
        </button>
        <button
          onClick={() => setActiveTab("loc-anh")}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "loc-anh"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Lọc Ảnh
        </button>
      </div>

      {/* Tab: Ảnh đã chọn */}
      {activeTab === "selections" && (
        <div className="space-y-8">
          {Object.keys(groupedSelections).length === 0 ? (
            <div className="text-center py-20 bg-card rounded-xl border">
              <p className="text-muted-foreground font-serif text-lg">Chưa có khách hàng nào chọn ảnh.</p>
            </div>
          ) : (
            Object.entries(groupedSelections).map(([customerName, selections]) => (
              <Card key={customerName} className="overflow-hidden">
                <CardHeader className="bg-muted/30 border-b pb-4">
                  <CardTitle className="font-serif text-xl flex items-center justify-between">
                    <span>{customerName}</span>
                    <span className="text-sm font-sans font-normal text-muted-foreground bg-background px-3 py-1 rounded-full border shadow-sm">
                      {selections.length} ảnh
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {selections.map((sel) => (
                      <div key={sel.id} className="space-y-2">
                        <div className="aspect-square rounded-md overflow-hidden bg-muted border">
                          {sel.photo?.driveFileId ? (
                            <img
                              src={`/api/drive/proxy/${sel.photo.driveFileId}`}
                              alt={sel.photo.filename}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
                              Lỗi hiển thị
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-center truncate px-1 text-muted-foreground">
                          {sel.photo?.filename || "Unknown"}
                        </div>
                        {sel.note && (
                          <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/30 p-2 rounded text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2" title={sel.note}>{sel.note}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab: Lọc Ảnh */}
      {activeTab === "loc-anh" && (
        <LocAnh selectedFileNames={selectedFileNames} />
      )}
    </div>
  );
}

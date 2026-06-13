import { useState, useRef } from "react";
import {
  useListDeliverables,
  getListDeliverablesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  PackageCheck,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { BeforeAfterSlider } from "./before-after-slider";

interface AlbumDeliverablesSectionProps {
  albumId: string;
  deliverableRootFolderUrl: string | null | undefined;
}

interface UploadResult {
  versionLabel: string;
  matchedCount: number;
  unmatchedCount: number;
  driveFolderUrl: string;
}

export function AlbumDeliverablesSection({
  albumId,
  deliverableRootFolderUrl,
}: AlbumDeliverablesSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isLoading } = useListDeliverables(albumId, {
    query: { queryKey: getListDeliverablesQueryKey(albumId), enabled: !!albumId },
  });

  const deliverables = data?.deliverables ?? [];

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (images.length === 0) {
      toast({ title: "Chỉ chấp nhận file ảnh", variant: "destructive" });
      return;
    }
    setSelectedFiles(images);
    setLastResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }
      if (note.trim()) formData.append("note", note.trim());

      const res = await fetch(`/api/studios/albums/${albumId}/deliverables/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Lỗi upload", description: data.error || "Không thể upload", variant: "destructive" });
        return;
      }

      const result: UploadResult = {
        versionLabel: data.deliverable.versionLabel,
        matchedCount: data.deliverable.matchedCount,
        unmatchedCount: data.deliverable.unmatchedCount,
        driveFolderUrl: data.deliverable.driveFolderUrl,
      };
      setLastResult(result);
      setSelectedFiles([]);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey(albumId) });

      toast({
        title: `Đã tạo ${result.versionLabel}!`,
        description: `${result.matchedCount} ảnh khớp tên${result.unmatchedCount > 0 ? ` · ${result.unmatchedCount} ảnh không tìm thấy gốc` : ""}`,
      });
    } catch {
      toast({ title: "Lỗi kết nối", description: "Vui lòng thử lại.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const currentRootUrl = deliverableRootFolderUrl ?? data?.deliverables?.[0]?.driveFolderUrl;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-serif flex items-center gap-2 text-lg">
            <PackageCheck className="h-5 w-5" />
            Giao file chỉnh sửa
          </CardTitle>
          <Button
            size="sm"
            onClick={() => { setShowForm(v => !v); setLastResult(null); }}
            variant={showForm ? "ghost" : "default"}
          >
            {showForm ? (
              <><X className="h-4 w-4 mr-1" /> Đóng</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" /> Tải lên phiên bản mới</>
            )}
          </Button>
        </div>

        {currentRootUrl && !showForm && (
          <a
            href={currentRootUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            Thư mục "Ảnh chỉnh sửa" trên Drive
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Upload Form */}
        {showForm && (
          <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Phiên bản mới — {`v${deliverables.length + 1}`}
              </h3>
              <p className="text-xs text-muted-foreground">
                App tự tạo thư mục <code className="bg-muted px-1 rounded">Ảnh chỉnh sửa/v{deliverables.length + 1}</code> trên Drive
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : selectedFiles.length > 0
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              {selectedFiles.length === 0 ? (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Kéo & thả ảnh vào đây</p>
                  <p className="text-xs text-muted-foreground mt-1">hoặc nhấn để chọn file — hỗ trợ nhiều file cùng lúc</p>
                  <p className="text-xs text-muted-foreground mt-2 bg-muted/60 rounded px-3 py-1 inline-block">
                    Đặt tên file giống ảnh gốc để ghép tự động (VD: <code>DSC_0001.jpg</code>)
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-1" />
                  <p className="text-sm font-semibold text-primary">{selectedFiles.length} ảnh đã chọn</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Nhấn để chọn lại</p>
                </>
              )}
            </div>

            {/* File list preview */}
            {selectedFiles.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2 bg-background">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5 px-1 hover:bg-muted/30 rounded">
                    <span className="truncate max-w-[80%] text-foreground/80">{f.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Note */}
            <div className="space-y-1.5">
              <Label className="text-sm">Ghi chú cho phiên bản này (tuỳ chọn)</Label>
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="VD: Đã chỉnh màu, làm mịn da theo yêu cầu của khách..."
                className="min-h-[60px] resize-none"
              />
            </div>

            {/* Result summary */}
            {lastResult && (
              <div className="flex items-start gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-green-800">Đã tạo {lastResult.versionLabel}!</span>
                  <span className="text-green-700 ml-1">
                    {lastResult.matchedCount} ảnh ghép trước/sau
                    {lastResult.unmatchedCount > 0 && ` · ${lastResult.unmatchedCount} ảnh chỉ có "sau"`}
                  </span>
                  {lastResult.unmatchedCount > 0 && (
                    <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Đặt tên file ảnh chỉnh sửa giống tên ảnh gốc để ghép tự động
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowForm(false); setLastResult(null); setSelectedFiles([]); }}>
                Hủy
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || uploading}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải lên {selectedFiles.length} ảnh...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Tải lên & Tạo phiên bản</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Deliverables list */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Đang tải...</span>
          </div>
        )}

        {!isLoading && deliverables.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Chưa có phiên bản nào</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Tải ảnh chỉnh sửa lên để khách xem kết quả và so sánh trước / sau.
            </p>
          </div>
        )}

        {deliverables.map((deliverable) => {
          const isOpen = previewVersion === deliverable.version;
          const matchedPhotos = deliverable.photos?.filter(p => p.originalPhoto) ?? [];
          const unmatchedPhotos = deliverable.photos?.filter(p => !p.originalPhoto) ?? [];

          return (
            <div key={deliverable.id} className="border rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                onClick={() => setPreviewVersion(isOpen ? null : deliverable.version)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-sm font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                    {deliverable.versionLabel}
                  </span>
                  <span className="text-sm font-medium shrink-0">
                    {deliverable.photos?.length ?? 0} ảnh
                    {matchedPhotos.length > 0 && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({matchedPhotos.length} trước/sau)
                      </span>
                    )}
                  </span>
                  {deliverable.note && (
                    <span className="text-xs text-muted-foreground line-clamp-1 hidden sm:block truncate">
                      {deliverable.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={deliverable.driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-primary hover:text-primary/80 transition-colors p-1"
                    title="Mở thư mục Drive"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isOpen && (
                <div className="p-4 space-y-4">
                  {deliverable.note && (
                    <p className="text-sm text-muted-foreground bg-muted/30 rounded px-3 py-2 border-l-2 border-primary/30">
                      {deliverable.note}
                    </p>
                  )}

                  {(!deliverable.photos || deliverable.photos.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Không có ảnh</p>
                  ) : (
                    <>
                      {matchedPhotos.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            So sánh Trước / Sau ({matchedPhotos.length} ảnh)
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {matchedPhotos.map(photo => (
                              <BeforeAfterSlider
                                key={photo.id}
                                beforeSrc={`/api/drive/proxy/${photo.originalPhoto!.driveFileId}`}
                                afterSrc={`/api/drive/proxy/${photo.editedImageUrl}`}
                                caption={photo.caption ?? undefined}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {unmatchedPhotos.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Chỉ có ảnh "Sau" ({unmatchedPhotos.length} ảnh — không tìm thấy ảnh gốc)
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {unmatchedPhotos.map(photo => (
                              <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                                <img
                                  src={`/api/drive/proxy/${photo.editedImageUrl}`}
                                  alt="Ảnh chỉnh sửa"
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

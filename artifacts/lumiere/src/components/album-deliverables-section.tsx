import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListDeliverables,
  useCreateDeliverable,
  getListDeliverablesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  PackageCheck,
} from "lucide-react";
import { BeforeAfterSlider } from "./before-after-slider";

interface Photo {
  id: string;
  driveFileId: string;
  filename: string;
  thumbnailUrl?: string | null;
}

interface AlbumDeliverablesSectionProps {
  albumId: string;
  deliverableRootFolderUrl: string | null | undefined;
  photos: Photo[];
}

const photoRowSchema = z.object({
  originalPhotoId: z.string().min(1, "Chọn ảnh gốc"),
  editedImageUrl: z.string().min(1, "Nhập URL ảnh đã chỉnh sửa"),
  caption: z.string().optional(),
});

const formSchema = z.object({
  versionFolderUrl: z.string().min(1, "Nhập URL thư mục Drive cho phiên bản này"),
  deliverableRootFolderUrl: z.string().optional(),
  note: z.string().optional(),
  photos: z.array(photoRowSchema).min(1, "Thêm ít nhất 1 ảnh"),
});

type FormValues = z.infer<typeof formSchema>;

function extractDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function toDriveProxyUrl(url: string): string {
  if (!url) return "";
  const fileId = extractDriveFileId(url);
  if (fileId) return `/api/drive/proxy/${fileId}`;
  if (!url.includes("/") && !url.startsWith("http")) return `/api/drive/proxy/${url}`;
  return url;
}

export function AlbumDeliverablesSection({
  albumId,
  deliverableRootFolderUrl,
  photos,
}: AlbumDeliverablesSectionProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const { data, isLoading } = useListDeliverables(albumId, {
    query: { queryKey: getListDeliverablesQueryKey(albumId), enabled: !!albumId },
  });
  const createDeliverable = useCreateDeliverable();

  const deliverables = data?.deliverables ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      versionFolderUrl: "",
      deliverableRootFolderUrl: "",
      note: "",
      photos: [{ originalPhotoId: "", editedImageUrl: "", caption: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "photos",
  });

  const onSubmit = (values: FormValues) => {
    createDeliverable.mutate(
      {
        id: albumId,
        data: {
          versionFolderUrl: values.versionFolderUrl,
          deliverableRootFolderUrl: values.deliverableRootFolderUrl || undefined,
          note: values.note || undefined,
          photos: values.photos.map(p => ({
            originalPhotoId: p.originalPhotoId,
            editedImageUrl: p.editedImageUrl,
            caption: p.caption || undefined,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Đã giao file thành công!" });
          queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey(albumId) });
          form.reset();
          setShowForm(false);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Lỗi khi tạo deliverable";
          toast({ title: "Lỗi", description: msg, variant: "destructive" });
        },
      }
    );
  };

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
            onClick={() => setShowForm(v => !v)}
            variant={showForm ? "ghost" : "default"}
          >
            {showForm ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" /> Ẩn form
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Giao phiên bản mới
              </>
            )}
          </Button>
        </div>

        {deliverableRootFolderUrl && (
          <a
            href={deliverableRootFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            Thư mục gốc trên Drive
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Create form */}
        {showForm && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Phiên bản mới — {`v${deliverables.length + 1}`}
            </h3>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!deliverableRootFolderUrl && (
                  <FormField
                    control={form.control}
                    name="deliverableRootFolderUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL thư mục gốc (chứa tất cả phiên bản)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="versionFolderUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL thư mục phiên bản này <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://drive.google.com/drive/folders/..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ghi chú cho phiên bản này</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="VD: Đã chỉnh màu, làm mịn da theo yêu cầu..."
                          className="min-h-[60px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Photos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Ảnh đã chỉnh sửa <span className="text-destructive">*</span>
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => append({ originalPhotoId: "", editedImageUrl: "", caption: "" })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Thêm ảnh
                    </Button>
                  </div>

                  {fields.map((field, index) => (
                    <div key={field.id} className="border rounded-lg p-3 space-y-2 bg-background">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Ảnh #{index + 1}</span>
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name={`photos.${index}.originalPhotoId`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Ảnh gốc</FormLabel>
                            <FormControl>
                              <select
                                {...f}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="">-- Chọn ảnh gốc --</option>
                                {photos.map(p => (
                                  <option key={p.id} value={p.id}>{p.filename}</option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`photos.${index}.editedImageUrl`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-xs">URL ảnh đã chỉnh sửa (Drive share link)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://drive.google.com/file/d/..."
                                className="text-xs"
                                {...f}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`photos.${index}.caption`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Chú thích (tuỳ chọn)</FormLabel>
                            <FormControl>
                              <Input placeholder="VD: Đã làm mịn da, xóa bóng đèn..." className="text-xs" {...f} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}

                  {form.formState.errors.photos?.root && (
                    <p className="text-sm text-destructive">{form.formState.errors.photos.root.message}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                    Hủy
                  </Button>
                  <Button type="submit" disabled={createDeliverable.isPending}>
                    {createDeliverable.isPending ? "Đang tạo..." : "Tạo phiên bản"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {/* Deliverables list */}
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Đang tải...</p>
        )}

        {!isLoading && deliverables.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Chưa giao file chỉnh sửa nào</p>
            <p className="text-xs text-muted-foreground/70">
              Nhấn "Giao phiên bản mới" để bắt đầu giao file cho khách hàng.
            </p>
          </div>
        )}

        {deliverables.map((deliverable) => {
          const isOpen = previewIndex === deliverable.version;
          return (
            <div key={deliverable.id} className="border rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setPreviewIndex(isOpen ? null : deliverable.version)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                    {deliverable.versionLabel}
                  </span>
                  <span className="text-sm font-medium">{deliverable.photos?.length ?? 0} ảnh</span>
                  {deliverable.note && (
                    <span className="text-xs text-muted-foreground line-clamp-1 hidden sm:block max-w-[200px]">
                      {deliverable.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={deliverable.driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-primary hover:text-primary/80 transition-colors"
                    title="Mở thư mục Drive"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="p-4 space-y-4">
                  {deliverable.note && (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded px-3 py-2 border-l-2 border-primary/30">
                      {deliverable.note}
                    </p>
                  )}
                  {(!deliverable.photos || deliverable.photos.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Không có ảnh nào</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {deliverable.photos.map(photo => {
                        const origSrc = photo.originalPhoto
                          ? `/api/drive/proxy/${photo.originalPhoto.driveFileId}`
                          : "";
                        const editSrc = toDriveProxyUrl(photo.editedImageUrl);
                        return (
                          <BeforeAfterSlider
                            key={photo.id}
                            beforeSrc={origSrc}
                            afterSrc={editSrc}
                            caption={photo.caption ?? undefined}
                          />
                        );
                      })}
                    </div>
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

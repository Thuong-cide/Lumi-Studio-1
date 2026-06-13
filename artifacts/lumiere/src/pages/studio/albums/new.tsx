import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateAlbum, getListAlbumsQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  title: z.string().min(1, "Vui lòng nhập tên album"),
  description: z.string().optional(),
  maxSelection: z.coerce.number().min(0).default(0),
  allowDownload: z.boolean().default(false),
  allowNotes: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  customerPhone: z
    .string()
    .refine((v) => v === "" || /^0\d{9}$/.test(v), {
      message: "Số điện thoại phải có 10 số, bắt đầu bằng 0",
    })
    .optional(),
  autoSendEnabled: z.boolean().default(true),
});

export default function NewAlbum() {
  const [, setLocation] = useLocation();
  const createAlbum = useCreateAlbum();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      maxSelection: me?.studio?.defaultMaxSelection ?? 0,
      allowDownload: false,
      allowNotes: true,
      isPublic: true,
      customerPhone: "",
      autoSendEnabled: true,
    },
  });

  useEffect(() => {
    const defaultMax = me?.studio?.defaultMaxSelection ?? 0;
    if (defaultMax > 0 && !form.formState.isDirty) {
      form.setValue("maxSelection", defaultMax);
    }
  }, [me?.studio?.defaultMaxSelection]);

  const hasWebhook = !!me?.studio?.n8nWebhookUrl;

  function onSubmit(values: z.infer<typeof formSchema>) {
    createAlbum.mutate(
      {
        data: {
          ...values,
          maxSelection: Number(values.maxSelection) || 0,
          customerPhone: values.customerPhone || undefined,
        },
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListAlbumsQueryKey() });

          const status = res.webhookStatus;
          if (status === "sent") {
            toast({ title: "Đã tạo album và đang gửi link Zalo cho khách..." });
          } else if (status === "skipped_no_phone") {
            toast({
              title: "Album đã tạo.",
              description: "Chưa gửi Zalo vì thiếu số điện thoại khách hàng.",
            });
          } else if (status === "skipped_no_webhook") {
            toast({
              title: "Album đã tạo.",
              description: "Chưa gửi Zalo vì studio chưa cấu hình webhook n8n (vào Cài đặt để thêm).",
            });
          } else {
            toast({ title: "Đã tạo album mới" });
          }

          setLocation(`/dashboard/albums/${res.album.id}`);
        },
        onError: (err) => {
          toast({
            title: "Lỗi",
            description: (err.data as { error?: string })?.error || err.message || "Không thể tạo album",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/dashboard/albums">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Tạo Album Mới</h1>
          <p className="text-muted-foreground mt-1">Cấu hình thông tin cho bộ ảnh mới của bạn.</p>
        </div>
      </div>

      <Card className="bg-card">
        <CardContent className="p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <h3 className="text-lg font-serif font-medium border-b pb-2">Thông tin cơ bản</h3>
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên Album</FormLabel>
                      <FormControl>
                        <Input placeholder="VD: Album Cưới Nam & Nữ" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mô tả (Không bắt buộc)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ghi chú thêm về bộ ảnh này..." 
                          className="resize-none h-24"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-serif font-medium border-b pb-2">Thông báo Zalo cho khách</h3>

                <FormField
                  control={form.control}
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
                      <FormDescription>10 số, bắt đầu bằng 0. Điền để hệ thống gửi link Zalo tự động.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="autoSendEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Tự động gửi qua Zalo khi tạo album</FormLabel>
                        <FormDescription>
                          Khi tạo album, hệ thống tự gửi link cho khách qua n8n nếu đã điền số điện thoại.
                          {!hasWebhook && (
                            <span className="block mt-1 text-amber-600 dark:text-amber-400">
                              Chưa cấu hình n8n Webhook URL —{" "}
                              <Link href="/dashboard/settings" className="underline underline-offset-2">
                                Cài đặt ngay
                              </Link>
                            </span>
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-serif font-medium border-b pb-2">Cấu hình tính năng</h3>
                
                <FormField
                  control={form.control}
                  name="maxSelection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số lượng ảnh tối đa khách được chọn</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <p className="mt-1 text-xs text-stone-500">Để trống hoặc nhập 0 nếu không muốn giới hạn</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background/50">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Công khai Album</FormLabel>
                          <FormDescription>
                            Bất kỳ ai có link đều có thể xem và chọn ảnh (yêu cầu nhập tên).
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowNotes"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background/50">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Cho phép ghi chú</FormLabel>
                          <FormDescription>
                            Khách hàng có thể để lại ghi chú cho từng ảnh được chọn.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowDownload"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background/50">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Cho phép tải xuống</FormLabel>
                          <FormDescription>
                            Khách hàng có thể tải ảnh chất lượng cao về máy.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  size="lg" 
                  className="px-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={createAlbum.isPending}
                >
                  {createAlbum.isPending ? "Đang tạo..." : "Tạo Album"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

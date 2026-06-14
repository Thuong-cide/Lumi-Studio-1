import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useUpdateStudioSettings,
  useUpdateWebhookSettings,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(2, "Tên Studio phải có ít nhất 2 ký tự"),
  password: z.string().optional(),
  defaultMaxSelection: z.coerce.number().min(0).default(0),
});

const webhookSchema = z.object({
  n8nWebhookUrl: z.string().url("Vui lòng nhập URL hợp lệ (bắt đầu bằng http/https)"),
  webhookSecret: z.string().optional(),
  deliverableNotifyEnabled: z.boolean().default(false),
});

export default function StudioSettings() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateSettings = useUpdateStudioSettings();
  const updateWebhook = useUpdateWebhookSettings();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", password: "", defaultMaxSelection: 0 },
  });

  const webhookForm = useForm<z.infer<typeof webhookSchema>>({
    resolver: zodResolver(webhookSchema),
    defaultValues: { n8nWebhookUrl: "", webhookSecret: "", deliverableNotifyEnabled: false },
  });

  useEffect(() => {
    if (me?.studio) {
      profileForm.setValue("name", me.studio.name);
      profileForm.setValue("defaultMaxSelection", me.studio.defaultMaxSelection ?? 0);
      if (me.studio.n8nWebhookUrl) {
        webhookForm.setValue("n8nWebhookUrl", me.studio.n8nWebhookUrl);
      }
      webhookForm.setValue("deliverableNotifyEnabled", (me.studio as { deliverableNotifyEnabled?: boolean }).deliverableNotifyEnabled ?? false);
    }
  }, [me]);

  function onSubmitProfile(values: z.infer<typeof profileSchema>) {
    const payload: { name?: string; password?: string; defaultMaxSelection?: number } = {
      name: values.name,
      defaultMaxSelection: values.defaultMaxSelection,
    };
    if (values.password && values.password.trim() !== "") {
      payload.password = values.password;
    }
    updateSettings.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Đã cập nhật cài đặt" });
          profileForm.setValue("password", "");
        },
        onError: (err) => {
          toast({
            title: "Lỗi",
            description: (err.data as { error?: string })?.error || err.message,
            variant: "destructive",
          });
        },
      }
    );
  }

  function onSubmitWebhook(values: z.infer<typeof webhookSchema>) {
    updateWebhook.mutate(
      { data: { n8nWebhookUrl: values.n8nWebhookUrl, webhookSecret: values.webhookSecret || undefined, deliverableNotifyEnabled: values.deliverableNotifyEnabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Đã lưu cấu hình Webhook" });
          webhookForm.setValue("webhookSecret", "");
        },
        onError: (err) => {
          toast({
            title: "Lỗi",
            description: (err.data as { error?: string })?.error || err.message,
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Cài đặt</h1>
        <p className="text-muted-foreground mt-1">Quản lý thông tin Studio và kết nối ứng dụng.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Kết nối</CardTitle>
            <CardDescription>Quản lý các dịch vụ lưu trữ bên ngoài</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-6 h-6">
                    <path fill="#FFC107" d="M17 5.8L5 26.6l5.9 10.2L23 16z"/>
                    <path fill="#1976D2" d="M30.9 5.8h-14l11.9 20.8 6-10.4z"/>
                    <path fill="#4CAF50" d="M37 16.2H13.1l-5.9 10.4L17 47h24z"/>
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Google Drive</h4>
                  <p className="text-sm text-muted-foreground">
                    {me?.studio?.googleDriveConnected
                      ? "Đã kết nối. Ảnh của bạn sẽ được lưu tại đây."
                      : "Chưa kết nối. Yêu cầu kết nối để lưu trữ ảnh."}
                  </p>
                </div>
              </div>
              <Link href="/dashboard/settings/drive">
                <Button variant={me?.studio?.googleDriveConnected ? "outline" : "default"}>
                  {me?.studio?.googleDriveConnected ? "Cấu hình" : "Kết nối ngay"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Cấu hình Webhook n8n</CardTitle>
            <CardDescription>
              Tự động gửi link album cho khách qua Zalo bằng cách kết nối với n8n workflow của bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {me?.studio?.n8nWebhookUrl && (
              <div className="mb-4 flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Đã cấu hình — webhook đang hoạt động</span>
              </div>
            )}
            <Form {...webhookForm}>
              <form onSubmit={webhookForm.handleSubmit(onSubmitWebhook)} className="space-y-4">
                <FormField
                  control={webhookForm.control}
                  name="n8nWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>n8n Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://your-n8n.example.com/webhook/lumiere-notify"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Dán URL webhook từ workflow n8n của bạn. Xem{" "}
                        <a
                          href="/docs/zalo-webhook-setup"
                          target="_blank"
                          className="underline underline-offset-2"
                        >
                          hướng dẫn thiết lập
                        </a>.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={webhookForm.control}
                  name="webhookSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook Secret <span className="text-muted-foreground font-normal">(tuỳ chọn)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Để trống nếu không cần xác thực HMAC"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Nếu điền, mỗi request sẽ có header <code className="text-xs bg-muted px-1 rounded">X-Lumiere-Signature</code> để n8n verify.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={webhookForm.control}
                  name="deliverableNotifyEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Thông báo khi tải file chỉnh sửa</FormLabel>
                        <FormDescription>
                          Tự động gửi thông báo Zalo qua webhook khi studio tải ảnh đã chỉnh sửa (deliverable) lên.
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
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={updateWebhook.isPending}
                  >
                    {updateWebhook.isPending ? "Đang lưu..." : "Lưu cấu hình"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Hồ sơ Studio</CardTitle>
            <CardDescription>Cập nhật thông tin hiển thị của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-6">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên Studio</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="defaultMaxSelection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số lượng ảnh tối đa mặc định</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder="0" {...field} className="w-40" />
                      </FormControl>
                      <FormDescription>
                        Giá trị này sẽ được điền sẵn khi tạo album mới. Để 0 nếu không muốn giới hạn mặc định.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Đổi mật khẩu</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Bỏ trống nếu không muốn đổi" {...field} />
                      </FormControl>
                      <FormDescription>Mật khẩu phải có ít nhất 6 ký tự</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={updateSettings.isPending}
                  >
                    {updateSettings.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

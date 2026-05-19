import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateStudioSettings, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(2, "Tên Studio phải có ít nhất 2 ký tự"),
  password: z.string().optional(),
});

export default function StudioSettings() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateSettings = useUpdateStudioSettings();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      password: "",
    },
  });

  useEffect(() => {
    if (me?.studio?.name) {
      form.setValue("name", me.studio.name);
    }
  }, [me, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    const payload: { name?: string; password?: string } = { name: values.name };
    if (values.password && values.password.trim() !== "") {
      payload.password = values.password;
    }

    updateSettings.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Đã cập nhật cài đặt" });
          form.setValue("password", ""); // Clear password field after success
        },
        onError: (err) => {
          toast({
            title: "Lỗi",
            description: (err.data as { error?: string })?.error || err.message || "Không thể cập nhật cài đặt",
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
            <CardTitle className="font-serif">Hồ sơ Studio</CardTitle>
            <CardDescription>Cập nhật thông tin hiển thị của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Đổi mật khẩu</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Bỏ trống nếu không muốn đổi" {...field} />
                      </FormControl>
                      <FormDescription>
                        Mật khẩu phải có ít nhất 6 ký tự
                      </FormDescription>
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

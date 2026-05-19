import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateAlbum, getListAlbumsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
  maxSelection: z.coerce.number().min(1, "Số lượng ảnh chọn tối thiểu là 1"),
  allowDownload: z.boolean().default(false),
  allowNotes: z.boolean().default(true),
  isPublic: z.boolean().default(false),
});

export default function NewAlbum() {
  const [, setLocation] = useLocation();
  const createAlbum = useCreateAlbum();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      maxSelection: 10,
      allowDownload: false,
      allowNotes: true,
      isPublic: false,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createAlbum.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListAlbumsQueryKey() });
          toast({ title: "Đã tạo album mới" });
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
                <h3 className="text-lg font-serif font-medium border-b pb-2">Cấu hình tính năng</h3>
                
                <FormField
                  control={form.control}
                  name="maxSelection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số lượng ảnh tối đa khách được chọn</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormDescription>
                        Khách hàng sẽ không thể chọn quá số lượng này.
                      </FormDescription>
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

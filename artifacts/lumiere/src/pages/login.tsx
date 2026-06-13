import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { FloatingContact } from "@/components/floating-contact";

const formSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const login = useLogin();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Đăng nhập thành công" });
          if (res.role === "ADMIN") {
            setLocation("/admin");
          } else {
            setLocation("/dashboard");
          }
        },
        onError: (err) => {
          toast({
            title: "Lỗi đăng nhập",
            description: (err.data as { error?: string })?.error || err.message || "Có lỗi xảy ra",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-serif font-bold text-foreground">Lumière</h1>
          <p className="mt-2 text-muted-foreground">Đăng nhập vào không gian của bạn</p>
        </div>

        <div className="bg-card p-8 rounded-xl border shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="studio@example.com" {...field} />
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
                    <FormLabel>Mật khẩu</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={login.isPending}
              >
                {login.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Đăng ký ngay
            </Link>
          </div>
        </div>
      </div>

      <FloatingContact />
    </div>
  );
}

import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function StudioLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-serif font-bold text-primary">Lumière</h1>
          <p className="text-sm text-muted-foreground truncate">{user?.studio?.name}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Link href="/dashboard">
            <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location === "/dashboard" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
              Tổng quan
            </span>
          </Link>
          <Link href="/dashboard/albums">
            <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location.startsWith("/dashboard/albums") ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
              Thư viện ảnh
            </span>
          </Link>
          <Link href="/dashboard/settings">
            <span className={`block px-4 py-2 rounded-md hover:bg-primary/10 cursor-pointer ${location.startsWith("/dashboard/settings") ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
              Cài đặt
            </span>
          </Link>
        </nav>
        <div className="p-4 border-t border-border">
          <Button variant="ghost" className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={logout}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}

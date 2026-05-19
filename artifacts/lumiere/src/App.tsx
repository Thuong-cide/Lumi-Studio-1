import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import Login from "@/pages/login";
import Register from "@/pages/register";
import { AdminLayout } from "@/components/layout/admin-layout";
import { StudioLayout } from "@/components/layout/studio-layout";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminStudios from "@/pages/admin/studios";

import StudioDashboard from "@/pages/studio/dashboard";
import StudioAlbums from "@/pages/studio/albums";
import NewAlbum from "@/pages/studio/albums/new";
import AlbumDetail from "@/pages/studio/albums/detail";
import AlbumSelections from "@/pages/studio/albums/selections";
import StudioSettings from "@/pages/studio/settings";
import StudioDrive from "@/pages/studio/drive";

import PublicGallery from "@/pages/public/gallery";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, role, layout: Layout }: { component: any, role: "ADMIN" | "STUDIO", layout: any }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (user.user?.role !== role) {
        setLocation("/login");
      }
    }
  }, [user, isLoading, role, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-serif text-xl">Đang tải...</div>;
  if (!user || user.user?.role !== role) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function DefaultRoute() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    if (!isLoading) {
      if (user?.user?.role === "ADMIN") setLocation("/admin");
      else if (user?.user?.role === "STUDIO") setLocation("/dashboard");
      else setLocation("/login");
    }
  }, [user, isLoading, setLocation]);
  
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={DefaultRoute} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/admin">
        <ProtectedRoute role="ADMIN" layout={AdminLayout} component={AdminDashboard} />
      </Route>
      <Route path="/admin/studios">
        <ProtectedRoute role="ADMIN" layout={AdminLayout} component={AdminStudios} />
      </Route>
      
      <Route path="/dashboard">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={StudioDashboard} />
      </Route>
      <Route path="/dashboard/albums">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={StudioAlbums} />
      </Route>
      <Route path="/dashboard/albums/new">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={NewAlbum} />
      </Route>
      <Route path="/dashboard/albums/:id">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={AlbumDetail} />
      </Route>
      <Route path="/dashboard/albums/:id/selections">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={AlbumSelections} />
      </Route>
      <Route path="/dashboard/settings">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={StudioSettings} />
      </Route>
      <Route path="/dashboard/settings/drive">
        <ProtectedRoute role="STUDIO" layout={StudioLayout} component={StudioDrive} />
      </Route>
      
      <Route path="/album/:slug" component={PublicGallery} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

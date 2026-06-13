import { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export type MeUser = {
  id: string;
  email: string;
  role: "ADMIN" | "STUDIO";
  status?: string;
};

export type MeStudio = {
  id: string;
  name: string;
  email: string;
  googleDriveConnected: boolean;
  rootFolderId?: string | null;
};

export type MeData = {
  user?: MeUser;
  studio?: MeStudio;
};

type AuthContextType = {
  user: MeData | undefined;
  isLoading: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError, error } = useGetMe();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (!isError || !error || !wasAuthenticated.current) return;

    const apiError = error as { status?: number; data?: { error?: string; code?: string } };
    const msg = apiError.data?.error;
    const status = apiError.status;

    if (status === 403 && msg) {
      toast({
        title: "Phiên làm việc đã kết thúc",
        description: msg,
        variant: "destructive",
      });
    }

    wasAuthenticated.current = false;
    setLocation("/login");
  }, [isError, error, setLocation, toast]);

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        wasAuthenticated.current = false;
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  return (
    <AuthContext.Provider value={{ user: user as MeData | undefined, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

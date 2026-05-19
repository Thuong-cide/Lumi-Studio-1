import { createContext, useContext, ReactNode } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

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
  const { data: user, isLoading } = useGetMe();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
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

import { createContext, useContext, ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SubscriptionExpiredModal } from "@/components/subscription/SubscriptionExpiredModal";

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
  status?: string;
  trialEndsAt?: string | null;
  subscriptionExpiresAt?: string | null;
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
  showSubscriptionModal: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError, error, refetch } = useGetMe();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const wasAuthenticated = useRef(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (!isError || !error || !wasAuthenticated.current) return;

    const apiError = error as { status?: number; data?: { error?: string; code?: string } };
    const msg = apiError.data?.error;
    const code = apiError.data?.code;
    const status = apiError.status;

    if (status === 403 && code === "SUBSCRIPTION_EXPIRED") {
      setSubscriptionExpired(true);
      return;
    }

    wasAuthenticated.current = false;

    if (status === 403 && msg) {
      setAlertMessage(msg);
    } else {
      setLocation("/login");
    }
  }, [isError, error, setLocation]);

  const handleAlertClose = () => {
    setAlertMessage(null);
    queryClient.clear();
    setLocation("/login");
  };

  const handleSubscriptionPaid = useCallback(() => {
    setSubscriptionExpired(false);
    queryClient.clear();
    window.location.reload();
  }, [queryClient]);

  const showSubscriptionModal = useCallback(() => {
    setSubscriptionExpired(true);
  }, []);

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
    <AuthContext.Provider value={{ user: user as MeData | undefined, isLoading, logout, showSubscriptionModal }}>
      {children}

      <SubscriptionExpiredModal
        open={subscriptionExpired}
        onPaid={handleSubscriptionPaid}
      />

      <AlertDialog open={alertMessage !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Phiên làm việc đã kết thúc
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {alertMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleAlertClose}>
              Đã hiểu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

export function useSubscriptionCheck() {
  const { showSubscriptionModal } = useAuth();

  return useCallback(async (fn: () => Promise<Response>) => {
    const res = await fn();
    if (res.status === 403) {
      const data = await res.clone().json().catch(() => ({}));
      if (data.code === "SUBSCRIPTION_EXPIRED") {
        showSubscriptionModal();
        throw new Error("SUBSCRIPTION_EXPIRED");
      }
    }
    return res;
  }, [showSubscriptionModal]);
}

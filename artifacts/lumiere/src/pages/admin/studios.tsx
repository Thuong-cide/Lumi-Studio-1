import { useState } from "react";
import { useListAdminStudios, getListAdminStudiosQueryKey, useUpdateStudioStatus, useDeleteStudio } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { format, isPast, isValid, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { motion } from "framer-motion";
import { MoreHorizontal, Check, X, Trash2, KeyRound, CalendarClock, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type ExpiryTarget = { id: string; name: string; expiresAt?: string | null };

function ExpiryBadge({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (!isValid(date)) return null;
  const expired = isPast(date);
  const daysLeft = differenceInDays(date, new Date());
  if (expired) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <XCircle className="h-3 w-3" />
        Hết hạn {format(date, "dd/MM/yyyy")}
      </Badge>
    );
  }
  if (daysLeft <= 14) {
    return (
      <Badge className="text-xs gap-1 bg-orange-500 hover:bg-orange-500/80 text-white">
        <CalendarClock className="h-3 w-3" />
        Còn {daysLeft} ngày
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs gap-1">
      <CalendarClock className="h-3 w-3" />
      Hạn đến {format(date, "dd/MM/yyyy")}
    </Badge>
  );
}

export default function AdminStudios() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "DISABLED">("ALL");
  const queryClient = useQueryClient();
  const updateStatus = useUpdateStudioStatus();
  const deleteStudio = useDeleteStudio();
  const [studioToDelete, setStudioToDelete] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const [expiryTarget, setExpiryTarget] = useState<ExpiryTarget | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [savingExpiry, setSavingExpiry] = useState(false);

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/studios/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi server");
      toast({ title: "Đã đặt lại mật khẩu", description: `Mật khẩu của ${resetTarget.name} đã được cập nhật.` });
      setResetTarget(null);
      setNewPassword("");
    } catch (e) {
      toast({ title: "Lỗi", description: e instanceof Error ? e.message : "Có lỗi xảy ra", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleSaveExpiry = async () => {
    if (!expiryTarget) return;
    setSavingExpiry(true);
    try {
      const res = await fetch(`/api/admin/studios/${expiryTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expiresAt: expiryDate ? new Date(expiryDate).toISOString() : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi server");
      toast({
        title: expiryDate ? "Đã cập nhật thời hạn" : "Đã xóa thời hạn",
        description: expiryDate
          ? `${expiryTarget.name} hết hạn vào ${format(new Date(expiryDate), "dd/MM/yyyy", { locale: vi })}.`
          : `${expiryTarget.name} không còn thời hạn sử dụng.`,
      });
      queryClient.invalidateQueries({ queryKey: getListAdminStudiosQueryKey(queryParams) });
      setExpiryTarget(null);
      setExpiryDate("");
    } catch (e) {
      toast({ title: "Lỗi", description: e instanceof Error ? e.message : "Có lỗi xảy ra", variant: "destructive" });
    } finally {
      setSavingExpiry(false);
    }
  };

  const queryParams = statusFilter === "ALL" ? {} : { status: statusFilter };
  const { data, isLoading } = useListAdminStudios(queryParams, {
    query: {
      queryKey: getListAdminStudiosQueryKey(queryParams),
    }
  });

  const handleUpdateStatus = (id: string, newStatus: "PENDING" | "APPROVED" | "DISABLED") => {
    updateStatus.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        toast({ title: "Đã cập nhật trạng thái studio" });
        queryClient.invalidateQueries({ queryKey: getListAdminStudiosQueryKey(queryParams) });
      },
      onError: (err) => {
        toast({ title: "Lỗi", description: (err.data as { error?: string })?.error || err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    if (!studioToDelete) return;
    deleteStudio.mutate({ id: studioToDelete }, {
      onSuccess: () => {
        toast({ title: "Đã xóa studio" });
        queryClient.invalidateQueries({ queryKey: getListAdminStudiosQueryKey(queryParams) });
        setStudioToDelete(null);
      },
      onError: (err) => {
        toast({ title: "Lỗi", description: (err.data as { error?: string })?.error || err.message, variant: "destructive" });
        setStudioToDelete(null);
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif font-bold text-foreground">Quản lý Studio</h1>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full">
        <TabsList className="mb-6 bg-card border">
          <TabsTrigger value="ALL">Tất cả</TabsTrigger>
          <TabsTrigger value="PENDING">Chờ duyệt</TabsTrigger>
          <TabsTrigger value="APPROVED">Đã duyệt</TabsTrigger>
          <TabsTrigger value="DISABLED">Đã khóa</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse font-serif">Đang tải danh sách...</div>
            ) : data?.studios.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-serif">Không có studio nào.</div>
            ) : (
              <div className="divide-y border-t border-border">
                {data?.studios.map((studio) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={studio.id}
                    className="flex items-center justify-between p-6 hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-serif font-bold text-lg">{studio.name}</h3>
                        <Badge variant={
                          studio.status === "APPROVED" ? "default" :
                          studio.status === "PENDING" ? "secondary" : "destructive"
                        } className={
                          studio.status === "APPROVED" ? "bg-success hover:bg-success/80 text-white" :
                          studio.status === "PENDING" ? "bg-accent/20 text-accent" : ""
                        }>
                          {studio.status === "APPROVED" ? "Đã duyệt" :
                           studio.status === "PENDING" ? "Chờ duyệt" : "Đã khóa"}
                        </Badge>
                        <ExpiryBadge expiresAt={studio.expiresAt} />
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground space-x-4">
                        <span>{studio.email}</span>
                        {studio.phone && (
                          <>
                            <span>•</span>
                            <span>{studio.phone}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>Tham gia: {format(new Date(studio.createdAt), "dd/MM/yyyy")}</span>
                        <span>•</span>
                        <span>{studio.albumCount || 0} albums</span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Hành động</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {studio.status !== "APPROVED" && (
                          <DropdownMenuItem onClick={() => handleUpdateStatus(studio.id, "APPROVED")}>
                            <Check className="mr-2 h-4 w-4 text-success" />
                            Phê duyệt
                          </DropdownMenuItem>
                        )}
                        {studio.status !== "DISABLED" && (
                          <DropdownMenuItem onClick={() => handleUpdateStatus(studio.id, "DISABLED")}>
                            <X className="mr-2 h-4 w-4 text-destructive" />
                            Khóa tài khoản
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          const current = studio.expiresAt
                            ? new Date(studio.expiresAt).toISOString().slice(0, 10)
                            : "";
                          setExpiryTarget({ id: studio.id, name: studio.name, expiresAt: studio.expiresAt });
                          setExpiryDate(current);
                        }}>
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Đặt thời hạn
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setResetTarget({ id: studio.id, name: studio.name }); setNewPassword(""); }}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Đặt lại mật khẩu
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => setStudioToDelete(studio.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Xóa studio
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* ── Dialog đặt thời hạn ── */}
      <Dialog open={!!expiryTarget} onOpenChange={(open) => { if (!open) { setExpiryTarget(null); setExpiryDate(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Đặt thời hạn sử dụng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Đặt ngày hết hạn cho studio <span className="font-semibold text-foreground">{expiryTarget?.name}</span>.
              Sau ngày này studio sẽ không thể đăng nhập.
            </p>
            <div className="space-y-2">
              <Label htmlFor="expiry-date">Ngày hết hạn</Label>
              <Input
                id="expiry-date"
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setExpiryDate(e.target.value)}
                autoFocus
              />
              {expiryDate && (
                <p className="text-xs text-muted-foreground">
                  Studio hết hạn vào ngày{" "}
                  <span className="font-medium text-foreground">
                    {format(new Date(expiryDate), "dd/MM/yyyy", { locale: vi })}
                  </span>
                </p>
              )}
            </div>
            {expiryTarget?.expiresAt && (
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => setExpiryDate("")}
              >
                Xóa thời hạn hiện tại
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setExpiryTarget(null); setExpiryDate(""); }}>Hủy</Button>
            <Button onClick={handleSaveExpiry} disabled={savingExpiry}>
              {savingExpiry ? "Đang lưu..." : expiryDate ? "Lưu thời hạn" : "Xóa thời hạn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog đặt lại mật khẩu ── */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Đặt lại mật khẩu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Đặt mật khẩu mới cho studio <span className="font-semibold text-foreground">{resetTarget?.name}</span>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-password">Mật khẩu mới</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Ít nhất 8 ký tự"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                autoFocus
              />
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-destructive">Mật khẩu phải có ít nhất 8 ký tự</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResetTarget(null); setNewPassword(""); }}>Hủy</Button>
            <Button onClick={handleResetPassword} disabled={newPassword.length < 8 || resetting}>
              {resetting ? "Đang cập nhật..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!studioToDelete} onOpenChange={(open) => !open && setStudioToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu của studio này sẽ bị xóa vĩnh viễn khỏi hệ thống.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

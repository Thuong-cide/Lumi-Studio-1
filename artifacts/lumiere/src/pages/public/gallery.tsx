import { useState, useRef, useEffect } from "react";
import {
  useGetPublicAlbum,
  getGetPublicAlbumQueryKey,
  useSelectPhoto,
  useGetPublicDeliverables,
  getGetPublicDeliverablesQueryKey,
} from "@workspace/api-client-react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart, X, Check, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, PackageCheck, ExternalLink, Images, ImageIcon, Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BeforeAfterSlider } from "@/components/before-after-slider";

type ViewMode = "all" | "original" | "edited";

function toDriveProxyUrl(url: string): string {
  if (!url) return "";
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return `/api/drive/proxy/${m[1]}`;
  if (!url.includes("/") && !url.startsWith("http")) return `/api/drive/proxy/${url}`;
  return url;
}

export default function PublicGallery() {
  const { slug } = useParams();
  const savedName = typeof window !== "undefined" ? (localStorage.getItem(`lumiere_name_${slug}`) || "") : "";
  const [customerName, setCustomerName] = useState(savedName);
  const [isJoined, setIsJoined] = useState(savedName.length >= 2);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [editedFullscreenIndex, setEditedFullscreenIndex] = useState<number | null>(null);
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // --- Zoom state (original fullscreen) ---
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  // --- Zoom state (edited fullscreen) ---
  const [editedScale, setEditedScale] = useState(1);
  const [editedTranslateX, setEditedTranslateX] = useState(0);
  const [editedTranslateY, setEditedTranslateY] = useState(0);

  // --- Refs ---
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef(1);
  const isPanning = useRef(false);
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const isSwiping = useRef(false);

  // Edited fullscreen refs
  const editedLastScale = useRef(1);
  const editedLastTX = useRef(0);
  const editedLastTY = useRef(0);
  const editedInitialPinch = useRef<number | null>(null);
  const editedInitialScale = useRef(1);
  const editedIsPanning = useRef(false);
  const editedPanStartX = useRef(0);
  const editedPanStartY = useRef(0);
  const editedIsSwiping = useRef(false);
  const editedSwipeStartX = useRef(0);
  const editedSwipeStartY = useRef(0);
  const editedLastTapTime = useRef(0);
  const editedLastTapX = useRef(0);
  const editedLastTapY = useRef(0);

  const queryClient = useQueryClient();
  const selectPhoto = useSelectPhoto();

  const { data: deliverablesData } = useGetPublicDeliverables(slug || "", {
    query: {
      enabled: !!slug && isJoined,
      queryKey: getGetPublicDeliverablesQueryKey(slug || ""),
    },
  });

  const { data: albumData, isLoading } = useGetPublicAlbum(slug || "", {
    query: {
      enabled: !!slug,
      queryKey: getGetPublicAlbumQueryKey(slug || ""),
      retry: false,
    }
  });

  const album = albumData;
  const photos = album?.photos || [];
  const deliverables = deliverablesData?.deliverables ?? [];
  const hasDeliverables = deliverables.length > 0 && (album?.showBeforeAfter ?? true);
  const activeDeliverable = deliverables.find(d => d.id === selectedDeliverableId)
    ?? deliverables[deliverables.length - 1];
  const editedPhotos = activeDeliverable?.photos ?? [];

  const [localSelections, setLocalSelections] = useState<Record<string, { selected: boolean, note?: string }>>({});
  const [selectionsLoaded, setSelectionsLoaded] = useState(false);

  useEffect(() => {
    if (!isJoined || !slug || !customerName || selectionsLoaded) return;
    fetch(`/api/public/album/${encodeURIComponent(slug)}/my-selections?name=${encodeURIComponent(customerName)}`)
      .then(r => r.json())
      .then((data: { selections?: Array<{ photoId: string; selected: boolean; note: string | null }> }) => {
        if (data.selections?.length) {
          const restored: Record<string, { selected: boolean; note?: string }> = {};
          data.selections.forEach(s => {
            restored[s.photoId] = { selected: s.selected, note: s.note ?? undefined };
          });
          setLocalSelections(restored);
        }
        setSelectionsLoaded(true);
      })
      .catch(() => setSelectionsLoaded(true));
  }, [isJoined, slug, customerName, selectionsLoaded]);

  const selectedCount = Object.values(localSelections).filter(v => v.selected).length;
  const maxSelection = album?.maxSelection || 0;
  const displayedPhotos = showOnlySelected
    ? photos.filter(p => localSelections[p.id]?.selected)
    : photos;

  // Changing view mode closes fullscreens
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setFullscreenIndex(null);
    setEditedFullscreenIndex(null);
    resetZoom();
    resetEditedZoom();
    if (mode !== "original" && mode !== "all") setShowOnlySelected(false);
  };

  // ── Zoom helpers (original) ──
  function resetZoom() {
    setScale(1); setTranslateX(0); setTranslateY(0);
    lastScale.current = 1; lastTranslateX.current = 0; lastTranslateY.current = 0;
  }

  function resetEditedZoom() {
    setEditedScale(1); setEditedTranslateX(0); setEditedTranslateY(0);
    editedLastScale.current = 1; editedLastTX.current = 0; editedLastTY.current = 0;
  }

  function getPinchDistance(touches: React.TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clampTranslate(tx: number, ty: number, currentScale: number) {
    const maxX = (window.innerWidth * (currentScale - 1)) / 2 + 80;
    const maxY = (window.innerHeight * (currentScale - 1)) / 2 + 80;
    return {
      x: Math.min(maxX, Math.max(-maxX, tx)),
      y: Math.min(maxY, Math.max(-maxY, ty)),
    };
  }

  function goPrev() {
    resetZoom();
    setFullscreenIndex(i => (i !== null ? Math.max(0, i - 1) : null));
  }

  function goNext() {
    resetZoom();
    setFullscreenIndex(i => (i !== null ? Math.min(displayedPhotos.length - 1, i + 1) : null));
  }

  function goEditedPrev() {
    resetEditedZoom();
    setEditedFullscreenIndex(i => (i !== null ? Math.max(0, i - 1) : null));
  }

  function goEditedNext() {
    resetEditedZoom();
    setEditedFullscreenIndex(i => (i !== null ? Math.min(editedPhotos.length - 1, i + 1) : null));
  }

  // ── Touch handlers (original fullscreen) ──
  function handleImageTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      initialPinchDist.current = getPinchDistance(e.touches);
      initialScale.current = lastScale.current;
      isPanning.current = false;
      isSwiping.current = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const dt = now - lastTapTime.current;
      const dx = Math.abs(touch.clientX - lastTapX.current);
      const dy = Math.abs(touch.clientY - lastTapY.current);
      if (dt < 300 && dx < 40 && dy < 40) {
        e.preventDefault();
        if (lastScale.current > 1.1) {
          resetZoom();
        } else {
          const targetScale = 2.5;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const originX = touch.clientX - rect.left - rect.width / 2;
          const originY = touch.clientY - rect.top - rect.height / 2;
          const tx = -originX * (targetScale - 1);
          const ty = -originY * (targetScale - 1);
          const clamped = clampTranslate(tx, ty, targetScale);
          setScale(targetScale); setTranslateX(clamped.x); setTranslateY(clamped.y);
          lastScale.current = targetScale; lastTranslateX.current = clamped.x; lastTranslateY.current = clamped.y;
        }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now; lastTapX.current = touch.clientX; lastTapY.current = touch.clientY;
      if (lastScale.current > 1.05) {
        e.preventDefault();
        isPanning.current = true; isSwiping.current = false;
        panStartX.current = touch.clientX - lastTranslateX.current;
        panStartY.current = touch.clientY - lastTranslateY.current;
      } else {
        isPanning.current = false; isSwiping.current = true;
        swipeStartX.current = touch.clientX; swipeStartY.current = touch.clientY;
      }
    }
  }

  function handleImageTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && initialPinchDist.current !== null) {
      e.preventDefault();
      const dist = getPinchDistance(e.touches);
      const newScale = Math.min(5, Math.max(1, initialScale.current * (dist / initialPinchDist.current)));
      const clamped = clampTranslate(lastTranslateX.current, lastTranslateY.current, newScale);
      setScale(newScale); setTranslateX(clamped.x); setTranslateY(clamped.y);
    } else if (e.touches.length === 1 && isPanning.current) {
      e.preventDefault();
      const touch = e.touches[0];
      const clamped = clampTranslate(touch.clientX - panStartX.current, touch.clientY - panStartY.current, lastScale.current);
      setTranslateX(clamped.x); setTranslateY(clamped.y);
    }
  }

  function handleImageTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2 && initialPinchDist.current !== null) {
      initialPinchDist.current = null;
      if (scale < 1.05) resetZoom();
      else { lastScale.current = scale; lastTranslateX.current = translateX; lastTranslateY.current = translateY; }
    } else if (isPanning.current && e.touches.length === 0) {
      isPanning.current = false;
      lastTranslateX.current = translateX; lastTranslateY.current = translateY;
    } else if (isSwiping.current && e.touches.length === 0) {
      isSwiping.current = false;
      const changedTouch = e.changedTouches[0];
      const diffX = swipeStartX.current - changedTouch.clientX;
      const diffY = changedTouch.clientY - swipeStartY.current;
      if (diffY > 80 && Math.abs(diffX) < 80) {
        setFullscreenIndex(null); resetZoom(); return;
      }
      if (Math.abs(diffX) > 50 && Math.abs(diffY) < 80) {
        if (diffX > 0) goNext(); else goPrev();
      }
    }
  }

  // ── Touch handlers (edited fullscreen) ──
  function handleEditedTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      editedInitialPinch.current = getPinchDistance(e.touches);
      editedInitialScale.current = editedLastScale.current;
      editedIsPanning.current = false; editedIsSwiping.current = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const dt = now - editedLastTapTime.current;
      const dx = Math.abs(touch.clientX - editedLastTapX.current);
      const dy = Math.abs(touch.clientY - editedLastTapY.current);
      if (dt < 300 && dx < 40 && dy < 40) {
        e.preventDefault();
        if (editedLastScale.current > 1.1) {
          resetEditedZoom();
        } else {
          const targetScale = 2.5;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const originX = touch.clientX - rect.left - rect.width / 2;
          const originY = touch.clientY - rect.top - rect.height / 2;
          const clamped = clampTranslate(-originX * (targetScale - 1), -originY * (targetScale - 1), targetScale);
          setEditedScale(targetScale); setEditedTranslateX(clamped.x); setEditedTranslateY(clamped.y);
          editedLastScale.current = targetScale; editedLastTX.current = clamped.x; editedLastTY.current = clamped.y;
        }
        editedLastTapTime.current = 0;
        return;
      }
      editedLastTapTime.current = now; editedLastTapX.current = touch.clientX; editedLastTapY.current = touch.clientY;
      if (editedLastScale.current > 1.05) {
        e.preventDefault();
        editedIsPanning.current = true; editedIsSwiping.current = false;
        editedPanStartX.current = touch.clientX - editedLastTX.current;
        editedPanStartY.current = touch.clientY - editedLastTY.current;
      } else {
        editedIsPanning.current = false; editedIsSwiping.current = true;
        editedSwipeStartX.current = touch.clientX; editedSwipeStartY.current = touch.clientY;
      }
    }
  }

  function handleEditedTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && editedInitialPinch.current !== null) {
      e.preventDefault();
      const newScale = Math.min(5, Math.max(1, editedInitialScale.current * (getPinchDistance(e.touches) / editedInitialPinch.current)));
      const clamped = clampTranslate(editedLastTX.current, editedLastTY.current, newScale);
      setEditedScale(newScale); setEditedTranslateX(clamped.x); setEditedTranslateY(clamped.y);
    } else if (e.touches.length === 1 && editedIsPanning.current) {
      e.preventDefault();
      const clamped = clampTranslate(e.touches[0].clientX - editedPanStartX.current, e.touches[0].clientY - editedPanStartY.current, editedLastScale.current);
      setEditedTranslateX(clamped.x); setEditedTranslateY(clamped.y);
    }
  }

  function handleEditedTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2 && editedInitialPinch.current !== null) {
      editedInitialPinch.current = null;
      if (editedScale < 1.05) resetEditedZoom();
      else { editedLastScale.current = editedScale; editedLastTX.current = editedTranslateX; editedLastTY.current = editedTranslateY; }
    } else if (editedIsPanning.current && e.touches.length === 0) {
      editedIsPanning.current = false;
      editedLastTX.current = editedTranslateX; editedLastTY.current = editedTranslateY;
    } else if (editedIsSwiping.current && e.touches.length === 0) {
      editedIsSwiping.current = false;
      const changedTouch = e.changedTouches[0];
      const diffX = editedSwipeStartX.current - changedTouch.clientX;
      const diffY = changedTouch.clientY - editedSwipeStartY.current;
      if (diffY > 80 && Math.abs(diffX) < 80) {
        setEditedFullscreenIndex(null); resetEditedZoom(); return;
      }
      if (Math.abs(diffX) > 50 && Math.abs(diffY) < 80) {
        if (diffX > 0) goEditedNext(); else goEditedPrev();
      }
    }
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (customerName.trim().length > 1) {
      localStorage.setItem(`lumiere_name_${slug}`, customerName.trim());
      setIsJoined(true);
    }
  };

  const handleChangeName = () => {
    localStorage.removeItem(`lumiere_name_${slug}`);
    setIsJoined(false);
  };

  const handleToggleSelect = (photoId: string) => {
    if (!album) return;
    const isCurrentlySelected = localSelections[photoId]?.selected || false;
    if (!isCurrentlySelected && selectedCount >= maxSelection) {
      toast({ title: "Đã đạt giới hạn", description: `Bạn chỉ được chọn tối đa ${maxSelection} ảnh.`, variant: "destructive" });
      return;
    }
    const newSelectedState = !isCurrentlySelected;
    const currentNote = localSelections[photoId]?.note;
    setLocalSelections(prev => ({ ...prev, [photoId]: { ...prev[photoId], selected: newSelectedState } }));
    selectPhoto.mutate({ slug: slug || "", data: { photoId, customerName, selected: newSelectedState, note: currentNote } });
  };

  const handleSaveNote = (photoId: string) => {
    setLocalSelections(prev => ({ ...prev, [photoId]: { ...prev[photoId], note: noteText } }));
    selectPhoto.mutate({ slug: slug || "", data: { photoId, customerName, selected: localSelections[photoId]?.selected || false, note: noteText } });
    setNoteOpenFor(null); setNoteText("");
  };

  const handleConfirmSelection = async () => {
    if (!slug || !customerName || isConfirming) return;
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/public/album/${encodeURIComponent(slug)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Lỗi", description: data.error || "Không thể xác nhận", variant: "destructive" }); return; }
      setConfirmed(true); setShowConfirmDialog(false);
      toast({ title: "Đã xác nhận!", description: `${data.photoCount} ảnh đã được gửi đến studio.` });
    } catch {
      toast({ title: "Lỗi kết nối", description: "Vui lòng thử lại.", variant: "destructive" });
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-serif text-foreground mb-2">Không tìm thấy Album</h1>
          <p className="text-muted-foreground">Album này có thể đã bị xóa hoặc đường dẫn không đúng.</p>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F8F6] p-4">
        <Card className="w-full max-w-md shadow-xl border-0 overflow-hidden">
          <div className="h-32 bg-primary/5 flex items-center justify-center border-b">
            <h1 className="text-3xl font-serif font-bold text-primary">{album.studio?.name || "Lumière"}</h1>
          </div>
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-serif font-medium text-foreground mb-2">{album.title}</h2>
              {album.description && <p className="text-muted-foreground">{album.description}</p>}
            </div>
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tên của bạn</label>
                <Input
                  placeholder="VD: Nguyễn Văn A"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-12"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 text-base"
                disabled={customerName.trim().length < 2}
              >
                Bắt đầu xem ảnh
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showOriginalGrid = viewMode === "all" || viewMode === "original";
  const showEditedGrid = viewMode === "edited";
  const showDeliverablesSection = viewMode === "all" && hasDeliverables;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border shadow-sm">
        {/* Main row */}
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-serif font-bold text-lg line-clamp-1 shrink-0 mr-2">{album.title}</div>

          {/* Selection controls — only for original/all modes */}
          {showOriginalGrid && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleChangeName}
                className="text-sm font-medium hidden sm:block hover:text-primary transition-colors"
              >
                Xin chào, <span className="underline underline-offset-2 decoration-dotted">{customerName}</span>
              </button>
              <button
                onClick={() => setShowOnlySelected(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm border ${
                  showOnlySelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${showOnlySelected ? "fill-current" : ""}`} />
                <span className="hidden sm:inline">{showOnlySelected ? "Tất cả ảnh" : "Ảnh đã chọn"}</span>
                <span className="sm:hidden">{selectedCount}</span>
              </button>
              <div className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-medium shadow-sm">
                {selectedCount}{maxSelection > 0 ? ` / ${maxSelection}` : ""}
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={() => setShowConfirmDialog(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm border ${
                    confirmed
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{confirmed ? "Đã xác nhận" : "Xác nhận"}</span>
                </button>
              )}
            </div>
          )}

          {/* Edited mode: show customer greeting + close button */}
          {showEditedGrid && (
            <div className="flex items-center gap-2">
              <button onClick={handleChangeName} className="text-sm hidden sm:block hover:text-primary transition-colors">
                Xin chào, <span className="underline underline-offset-2 decoration-dotted">{customerName}</span>
              </button>
            </div>
          )}
        </div>

        {/* View mode selector — only when deliverables exist */}
        {hasDeliverables && (
          <div className="max-w-7xl mx-auto px-4 pb-2 flex items-center justify-center sm:justify-start gap-1">
            <button
              onClick={() => changeViewMode("original")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                viewMode === "original"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <Images className="h-3 w-3" />
              Xem file gốc
            </button>
            <button
              onClick={() => changeViewMode("edited")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                viewMode === "edited"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <PackageCheck className="h-3 w-3" />
              Xem file chỉnh sửa
            </button>
            <button
              onClick={() => changeViewMode("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                viewMode === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <Layers className="h-3 w-3" />
              Xem toàn bộ
            </button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* ── Xem file gốc / Xem toàn bộ: Original Photos Grid ── */}
        {showOriginalGrid && (
          <div>
            {showOnlySelected && displayedPhotos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                <Heart className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground text-lg font-medium">Bạn chưa chọn ảnh nào</p>
                <button onClick={() => setShowOnlySelected(false)} className="text-primary text-sm hover:underline">
                  Quay lại xem tất cả ảnh
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
              {displayedPhotos.map((photo, index) => {
                const isSelected = localSelections[photo.id]?.selected;
                const note = localSelections[photo.id]?.note;
                return (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`group relative aspect-[3/4] sm:aspect-square bg-muted overflow-hidden transition-all duration-300 ${isSelected ? 'ring-4 ring-primary ring-offset-2' : ''}`}
                  >
                    <img
                      src={`/api/drive/proxy/${photo.driveFileId}`}
                      alt={photo.filename}
                      className="w-full h-full object-cover cursor-pointer"
                      loading={index === 0 ? "eager" : "lazy"}
                      decoding={index === 0 ? "sync" : "async"}
                      onClick={() => { setFullscreenIndex(index); resetZoom(); setShowOnlySelected(false); }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 sm:opacity-100 sm:bg-none transition-opacity pointer-events-none" />
                    <button
                      className={`absolute top-3 right-3 p-3 rounded-full backdrop-blur-sm transition-all shadow-sm ${isSelected ? 'bg-primary text-primary-foreground scale-110' : 'bg-white/80 text-gray-500 hover:bg-white hover:text-red-500 sm:opacity-0 group-hover:opacity-100'}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleSelect(photo.id); }}
                    >
                      <Heart className={`h-5 w-5 ${isSelected ? 'fill-current' : ''}`} />
                    </button>
                    {album.allowNotes && (
                      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                        {note ? (
                          <button
                            className="bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded line-clamp-1 text-left max-w-[80%] hover:bg-black/70"
                            onClick={(e) => { e.stopPropagation(); setNoteText(note); setNoteOpenFor(photo.id); }}
                          >
                            {note}
                          </button>
                        ) : (
                          <button
                            className="bg-black/40 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setNoteText(""); setNoteOpenFor(photo.id); }}
                          >
                            Thêm ghi chú
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Deliverables Section (Xem toàn bộ only) ── */}
        {showDeliverablesSection && (() => {
          const activeId = selectedDeliverableId ?? deliverables[deliverables.length - 1].id;
          const active = deliverables.find(d => d.id === activeId) ?? deliverables[deliverables.length - 1];
          return (
            <div className="border-t border-border pt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif font-semibold text-xl flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-primary" />
                  Ảnh đã chỉnh sửa
                </h2>
                {active.driveFolderUrl && (
                  <a href={active.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                    Tải về từ Drive <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {deliverables.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {deliverables.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDeliverableId(d.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                        d.id === activeId
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                      }`}
                    >
                      {d.versionLabel}
                      {d.note && <span className="ml-1.5 opacity-70 hidden sm:inline">— {d.note}</span>}
                    </button>
                  ))}
                </div>
              )}
              {active.note && (
                <p className="text-sm text-muted-foreground mb-4 bg-muted/40 rounded-lg px-4 py-2 border-l-2 border-primary/30">
                  {active.note}
                </p>
              )}
              {(!active.photos || active.photos.length === 0) ? (
                <p className="text-center text-muted-foreground py-8 text-sm">Chưa có ảnh nào trong phiên bản này.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {active.photos.map(photo => {
                    const origSrc = photo.originalPhoto ? `/api/drive/proxy/${photo.originalPhoto.driveFileId}` : "";
                    const editSrc = toDriveProxyUrl(photo.editedImageUrl);
                    return (
                      <BeforeAfterSlider key={photo.id} beforeSrc={origSrc} afterSrc={editSrc} caption={photo.caption ?? undefined} />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Xem file chỉnh sửa: Edited Photos Grid ── */}
        {showEditedGrid && (
          <div>
            {/* Version selector */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif font-semibold text-xl flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-primary" />
                Ảnh đã chỉnh sửa
                {activeDeliverable && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">— {activeDeliverable.versionLabel}</span>
                )}
              </h2>
              {activeDeliverable?.driveFolderUrl && (
                <a href={activeDeliverable.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Tải về từ Drive <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {deliverables.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {deliverables.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDeliverableId(d.id)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                      d.id === (selectedDeliverableId ?? deliverables[deliverables.length - 1].id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {d.versionLabel}
                    {d.note && <span className="ml-1.5 opacity-70 hidden sm:inline">— {d.note}</span>}
                  </button>
                ))}
              </div>
            )}

            {activeDeliverable?.note && (
              <p className="text-sm text-muted-foreground mb-5 bg-muted/40 rounded-lg px-4 py-2 border-l-2 border-primary/30">
                {activeDeliverable.note}
              </p>
            )}

            {editedPhotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">Chưa có ảnh trong phiên bản này</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {editedPhotos.map((photo, index) => {
                  const editSrc = toDriveProxyUrl(photo.editedImageUrl);
                  const origSrc = photo.originalPhoto
                    ? `/api/drive/proxy/${photo.originalPhoto.driveFileId}`
                    : "";

                  if (origSrc) {
                    return (
                      <BeforeAfterSlider
                        key={photo.id}
                        beforeSrc={origSrc}
                        afterSrc={editSrc}
                        caption={photo.caption ?? undefined}
                        onExpand={() => { setEditedFullscreenIndex(index); resetEditedZoom(); }}
                      />
                    );
                  }

                  return (
                    <motion.div
                      key={photo.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group relative aspect-[3/4] sm:aspect-square bg-muted overflow-hidden cursor-pointer"
                      onClick={() => { setEditedFullscreenIndex(index); resetEditedZoom(); }}
                    >
                      <img
                        src={editSrc}
                        alt={`Ảnh chỉnh sửa ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading={index === 0 ? "eager" : "lazy"}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note Dialog */}
      <Dialog open={!!noteOpenFor} onOpenChange={(open) => !open && setNoteOpenFor(null)}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4 pt-4">
            <h3 className="font-serif font-medium text-lg">Ghi chú cho ảnh</h3>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="VD: Cà mụn, làm sáng da, xóa người phía sau..."
              className="min-h-[100px]"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNoteOpenFor(null)}>Hủy</Button>
              <Button onClick={() => noteOpenFor && handleSaveNote(noteOpenFor)}>Lưu ghi chú</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── FULLSCREEN OVERLAY (original photos) ── */}
      <AnimatePresence>
        {fullscreenIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col select-none"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0 z-10">
              <span className="text-white/70 text-sm font-medium">{fullscreenIndex + 1} / {displayedPhotos.length}</span>
              {scale <= 1.05 && (
                <span className="text-white/30 text-xs hidden md:block">Chụm 2 ngón để zoom · Nhấp đôi để phóng to</span>
              )}
              {scale > 1.05 && (
                <button onClick={resetZoom} className="text-xs text-white/80 border border-white/30 rounded-full px-3 py-1 hover:bg-white/10 transition-colors">
                  Về 1×
                </button>
              )}
              <button onClick={() => { setFullscreenIndex(null); resetZoom(); }} className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <X size={20} className="text-white" />
              </button>
            </div>

            <div
              className="flex-1 relative flex items-center justify-center overflow-hidden"
              onTouchStart={handleImageTouchStart}
              onTouchMove={handleImageTouchMove}
              onTouchEnd={handleImageTouchEnd}
              style={{ touchAction: 'none' }}
            >
              <img
                src={`/api/drive/proxy/${displayedPhotos[fullscreenIndex].driveFileId}`}
                alt={displayedPhotos[fullscreenIndex].filename}
                className="max-h-full max-w-full object-contain pointer-events-none"
                draggable={false}
                style={{
                  transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
                  transformOrigin: 'center center',
                  transition: (isPanning.current || initialPinchDist.current !== null) ? 'none' : 'transform 0.15s ease-out',
                  willChange: 'transform',
                  cursor: scale > 1.05 ? 'grab' : 'default',
                }}
              />
              {scale <= 1.05 && (
                <>
                  <button onClick={goPrev} disabled={fullscreenIndex === 0} className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-20 active:bg-black/60 transition-colors z-10">
                    <ChevronLeft size={24} />
                  </button>
                  <button onClick={goNext} disabled={fullscreenIndex === displayedPhotos.length - 1} className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-20 active:bg-black/60 transition-colors z-10">
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>

            <div className="shrink-0 px-4 py-4 bg-black/60 flex items-center justify-between gap-3 z-10">
              <button
                className={`flex items-center gap-2 px-6 py-3 rounded-full text-base font-medium transition-all transform hover:scale-105 ${localSelections[displayedPhotos[fullscreenIndex].id]?.selected ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                onClick={() => handleToggleSelect(displayedPhotos[fullscreenIndex].id)}
              >
                <Heart className={`h-5 w-5 ${localSelections[displayedPhotos[fullscreenIndex].id]?.selected ? 'fill-current text-red-500' : ''}`} />
                {localSelections[displayedPhotos[fullscreenIndex].id]?.selected ? 'Đã chọn ảnh này' : 'Chọn ảnh này'}
              </button>
              {album.allowNotes && (
                <button
                  className="flex items-center gap-2 px-4 py-3 rounded-full text-sm text-white/70 bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={() => {
                    const photo = displayedPhotos[fullscreenIndex];
                    setNoteText(localSelections[photo.id]?.note || "");
                    setNoteOpenFor(photo.id);
                  }}
                >
                  <Check size={16} />
                  {localSelections[displayedPhotos[fullscreenIndex].id]?.note ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FULLSCREEN OVERLAY (edited photos) ── */}
      <AnimatePresence>
        {editedFullscreenIndex !== null && editedPhotos[editedFullscreenIndex] && (() => {
          const fsPhoto = editedPhotos[editedFullscreenIndex];
          const fsEditSrc = toDriveProxyUrl(fsPhoto.editedImageUrl);
          const fsOrigSrc = fsPhoto.originalPhoto
            ? `/api/drive/proxy/${fsPhoto.originalPhoto.driveFileId}`
            : "";
          const hasOriginal = !!fsOrigSrc;

          return (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col select-none"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0 z-10">
                <span className="text-white/70 text-sm font-medium">{editedFullscreenIndex + 1} / {editedPhotos.length}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40 bg-white/10 rounded-full px-2 py-0.5">
                    {activeDeliverable?.versionLabel ?? ""}
                  </span>
                  {!hasOriginal && editedScale > 1.05 && (
                    <button onClick={resetEditedZoom} className="text-xs text-white/80 border border-white/30 rounded-full px-3 py-1 hover:bg-white/10 transition-colors">
                      Về 1×
                    </button>
                  )}
                  {!hasOriginal && editedScale <= 1.05 && (
                    <span className="text-white/30 text-xs hidden md:block">Chụm 2 ngón để zoom</span>
                  )}
                  {hasOriginal && (
                    <span className="text-white/40 text-xs hidden md:block">Kéo thanh để so sánh Trước / Sau</span>
                  )}
                </div>
                <button onClick={() => { setEditedFullscreenIndex(null); resetEditedZoom(); }} className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <X size={20} className="text-white" />
                </button>
              </div>

              {/* Content */}
              {hasOriginal ? (
                /* Before/After Slider fullscreen */
                <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden min-h-0">
                  <div className="w-full h-full max-w-5xl">
                    <BeforeAfterSlider
                      beforeSrc={fsOrigSrc}
                      afterSrc={fsEditSrc}
                      fill={true}
                      caption={fsPhoto.caption}
                    />
                  </div>
                </div>
              ) : (
                /* Plain image with zoom/pan */
                <div
                  className="flex-1 relative flex items-center justify-center overflow-hidden"
                  onTouchStart={handleEditedTouchStart}
                  onTouchMove={handleEditedTouchMove}
                  onTouchEnd={handleEditedTouchEnd}
                  style={{ touchAction: 'none' }}
                >
                  <img
                    src={fsEditSrc}
                    alt={`Ảnh chỉnh sửa ${editedFullscreenIndex + 1}`}
                    className="max-h-full max-w-full object-contain pointer-events-none"
                    draggable={false}
                    style={{
                      transform: `scale(${editedScale}) translate(${editedTranslateX / editedScale}px, ${editedTranslateY / editedScale}px)`,
                      transformOrigin: 'center center',
                      transition: (editedIsPanning.current || editedInitialPinch.current !== null) ? 'none' : 'transform 0.15s ease-out',
                      willChange: 'transform',
                      cursor: editedScale > 1.05 ? 'grab' : 'default',
                    }}
                  />
                  {fsPhoto.caption && (
                    <div className="absolute bottom-16 left-0 right-0 text-center pointer-events-none">
                      <span className="bg-black/60 text-white/80 text-sm px-4 py-1.5 rounded-full">
                        {fsPhoto.caption}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Nav footer — prev/next + optional caption for slider mode */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-black/60 z-10">
                <button
                  onClick={goEditedPrev}
                  disabled={editedFullscreenIndex === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-white disabled:opacity-20 hover:bg-white/20 active:bg-white/30 transition-colors text-sm"
                >
                  <ChevronLeft size={18} /> Trước
                </button>

                {hasOriginal && fsPhoto.caption && (
                  <span className="text-white/60 text-xs text-center flex-1 mx-4 line-clamp-1">
                    {fsPhoto.caption}
                  </span>
                )}
                {!hasOriginal && <div className="flex-1" />}

                <button
                  onClick={goEditedNext}
                  disabled={editedFullscreenIndex === editedPhotos.length - 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-white disabled:opacity-20 hover:bg-white/20 active:bg-white/30 transition-colors text-sm"
                >
                  Sau <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Dialog xác nhận danh sách */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-semibold">Xác nhận danh sách</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Bạn đang xác nhận <span className="font-semibold text-foreground">{selectedCount} ảnh</span> đã chọn. Studio sẽ nhận được danh sách này.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-left">
              <p className="text-xs text-muted-foreground mb-1">Khách hàng</p>
              <p className="font-medium text-sm">{customerName}</p>
            </div>
            <p className="text-xs text-muted-foreground">Bạn vẫn có thể thay đổi lựa chọn và xác nhận lại sau khi gửi.</p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmDialog(false)} disabled={isConfirming}>Huỷ</Button>
              <Button className="flex-1" onClick={handleConfirmSelection} disabled={isConfirming}>
                {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gửi xác nhận"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

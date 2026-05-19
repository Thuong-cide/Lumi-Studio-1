import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  FileDown,
  Play,
  FolderInput,
  FolderOutput,
  FolderPlus,
} from "lucide-react";

interface LocAnhProps {
  selectedFileNames: string[];
}

const FORMAT_LIST = [
  { key: "JPG",  label: "JPG / JPEG",       exts: ["jpg", "jpeg"], isRaw: false },
  { key: "NEF",  label: "NEF — Nikon RAW",   exts: ["nef"],         isRaw: true  },
  { key: "CR2",  label: "CR2 — Canon RAW",   exts: ["cr2"],         isRaw: true  },
  { key: "CR3",  label: "CR3 — Canon RAW",   exts: ["cr3"],         isRaw: true  },
  { key: "ARW",  label: "ARW — Sony RAW",    exts: ["arw"],         isRaw: true  },
  { key: "DNG",  label: "DNG",               exts: ["dng"],         isRaw: true  },
  { key: "RW2",  label: "RW2 — Panasonic",   exts: ["rw2"],         isRaw: true  },
  { key: "ORF",  label: "ORF — Olympus",     exts: ["orf"],         isRaw: true  },
  { key: "RAF",  label: "RAF — Fujifilm",    exts: ["raf"],         isRaw: true  },
];

const RAW_KEYS = FORMAT_LIST.filter(f => f.isRaw).map(f => f.key);

async function getAllFiles(dirHandle: any): Promise<Array<{ name: string; handle: any }>> {
  const files: Array<{ name: string; handle: any }> = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") {
      files.push({ name, handle });
    } else {
      const sub = await getAllFiles(handle);
      files.push(...sub);
    }
  }
  return files;
}

function filterFiles(
  allFiles: Array<{ name: string; handle: any }>,
  nameList: string[],
  selectedExts: string[]
) {
  const nameSet = new Set(nameList.map(n => n.trim().toUpperCase()));
  const extSet = new Set(selectedExts.map(e => e.replace(".", "").toUpperCase()));
  return allFiles.filter(f => {
    const parts = f.name.split(".");
    const ext = parts.pop()!.toUpperCase();
    const base = parts.join(".").toUpperCase();
    return nameSet.has(base) && extSet.has(ext);
  });
}

async function copyFiles(
  matchedFiles: Array<{ name: string; handle: any }>,
  destHandle: any,
  onProgress: (done: number, total: number) => void
) {
  let done = 0;
  for (const f of matchedFiles) {
    const file = await f.handle.getFile();
    const newHandle = await destHandle.getFileHandle(file.name, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    done++;
    onProgress(done, matchedFiles.length);
  }
}

export default function LocAnh({ selectedFileNames }: LocAnhProps) {
  const isSupported = "showDirectoryPicker" in window;

  const [fileNames, setFileNames] = useState<string[]>([]);
  const [srcHandle, setSrcHandle] = useState<any>(null);
  const [srcName, setSrcName] = useState("");
  const [destMode, setDestMode] = useState<"pick" | "subfolder">("subfolder");
  const [destHandle, setDestHandle] = useState<any>(null);
  const [destName, setDestName] = useState("");
  const [subfolderName, setSubfolderName] = useState("Culled");
  const [parentHandle, setParentHandle] = useState<any>(null);
  const [parentName, setParentName] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(["NEF", "JPG"]));
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<{ copied: string[]; missing: string[] } | null>(null);
  const [missingExpanded, setMissingExpanded] = useState(false);

  function toggleFormat(key: string) {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllRaw() {
    setSelectedFormats(prev => new Set([...prev, ...RAW_KEYS]));
  }

  function deselectAllRaw() {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      RAW_KEYS.forEach(k => next.delete(k));
      return next;
    });
  }

  async function pickSrcFolder() {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "read" });
      setSrcHandle(handle);
      setSrcName(handle.name);
    } catch (_) {}
  }

  async function pickDestFolder() {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setDestHandle(handle);
      setDestName(handle.name);
    } catch (_) {}
  }

  async function pickParentFolder() {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setParentHandle(handle);
      setParentName(handle.name);
      setDestHandle(null);
      setDestName("");
    } catch (_) {}
  }

  async function handleStart() {
    if (!srcHandle || fileNames.length === 0 || selectedFormats.size === 0) return;

    let resolvedDest = destHandle;
    if (destMode === "subfolder") {
      if (!parentHandle || !subfolderName.trim()) return;
      resolvedDest = await parentHandle.getDirectoryHandle(subfolderName.trim(), { create: true });
    }
    if (!resolvedDest) return;

    setIsRunning(true);
    setResults(null);
    setProgress({ done: 0, total: 0 });

    try {
      const allFiles = await getAllFiles(srcHandle);
      const selectedExts = FORMAT_LIST
        .filter(f => selectedFormats.has(f.key))
        .flatMap(f => f.exts);

      const matched = filterFiles(allFiles, fileNames, selectedExts);
      setProgress({ done: 0, total: matched.length });

      const matchedBaseNames = new Set(
        matched.map(f => {
          const parts = f.name.split(".");
          parts.pop();
          return parts.join(".").toUpperCase();
        })
      );

      await copyFiles(matched, resolvedDest, (done, total) => {
        setProgress({ done, total });
      });

      const missing = fileNames.filter(n => !matchedBaseNames.has(n.trim().toUpperCase()));
      setResults({ copied: matched.map(f => f.name), missing });
    } catch (err: any) {
      setResults({ copied: [], missing: ["Lỗi: " + (err?.message || String(err))] });
    } finally {
      setIsRunning(false);
    }
  }

  function exportMissing() {
    if (!results?.missing.length) return;
    const blob = new Blob([results.missing.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "file-khong-tim-thay.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canStart =
    !isRunning &&
    fileNames.length > 0 &&
    srcHandle !== null &&
    selectedFormats.size > 0 &&
    (destMode === "pick" ? destHandle !== null : parentHandle !== null && subfolderName.trim() !== "");

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (!isSupported) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start gap-3 p-5 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-900">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">Trình duyệt không được hỗ trợ</p>
            <p className="text-sm">
              Tính năng Lọc Ảnh yêu cầu <strong>Chrome</strong> hoặc <strong>Edge</strong> trên máy tính để bàn.
              Vui lòng mở lại bằng Chrome hoặc Edge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">

      {/* Header notice */}
      <div className="bg-muted/40 border rounded-xl p-4 text-sm text-muted-foreground">
        <p>
          Công cụ này dành cho <strong className="text-foreground">nhân viên studio</strong> — 
          chạy trên máy tính Windows/Mac với Chrome hoặc Edge. 
          Truy cập trực tiếp ổ đĩa cục bộ, thẻ nhớ, hoặc ổ ngoài để sao chép file ảnh.
        </p>
      </div>

      {/* ── STEP 1: Danh sách file ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">Bước 1 — Danh sách ảnh cần lọc</span>
          {fileNames.length > 0 && (
            <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">
              {fileNames.length} files
            </span>
          )}
        </div>
        <div className="p-5 space-y-3">
          {selectedFileNames.length > 0 ? (
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                size="sm"
                onClick={() => setFileNames(selectedFileNames)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Nhận danh sách từ tab Chọn Ảnh
                <span className="ml-1.5 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {selectedFileNames.length} ảnh
                </span>
              </Button>
              {fileNames.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  → Đã tải {fileNames.length} file names
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Chưa có danh sách ảnh. Yêu cầu khách hàng chọn ảnh xong ở tab <strong>Chọn Ảnh</strong> trước, 
                sau đó quay lại đây nhận danh sách.
              </p>
            </div>
          )}

          {fileNames.length > 0 && (
            <div className="rounded-lg bg-muted/40 border px-4 py-2 max-h-24 overflow-y-auto">
              <p className="text-xs font-mono text-muted-foreground line-clamp-3">
                {fileNames.slice(0, 8).join(", ")}{fileNames.length > 8 ? ` ... +${fileNames.length - 8} nữa` : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── STEP 2: Thư mục nguồn ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b">
          <span className="font-semibold text-sm">Bước 2 — Thư mục nguồn</span>
          <span className="text-xs text-muted-foreground ml-2">(thẻ nhớ, ổ cứng ngoài, D:/DCIM...)</span>
        </div>
        <div className="p-5 space-y-3">
          <Button variant="outline" onClick={pickSrcFolder} className="gap-2">
            <FolderInput className="h-4 w-4" />
            Chọn thư mục nguồn
          </Button>
          {srcName ? (
            <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-muted/40 rounded-lg px-3 py-2 border">
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
              {srcName}
              <span className="text-xs text-muted-foreground ml-auto">đã chọn</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Chưa chọn thư mục nguồn</p>
          )}
        </div>
      </div>

      {/* ── STEP 3: Thư mục đích ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b">
          <span className="font-semibold text-sm">Bước 3 — Thư mục đích</span>
          <span className="text-xs text-muted-foreground ml-2">(thư mục dự án, thư mục chỉnh sửa...)</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input
                type="radio"
                name="destMode"
                value="pick"
                checked={destMode === "pick"}
                onChange={() => setDestMode("pick")}
                className="accent-primary"
              />
              Chọn thư mục đích có sẵn
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input
                type="radio"
                name="destMode"
                value="subfolder"
                checked={destMode === "subfolder"}
                onChange={() => setDestMode("subfolder")}
                className="accent-primary"
              />
              Tạo thư mục con mới
            </label>
          </div>

          {destMode === "pick" && (
            <div className="space-y-2">
              <Button variant="outline" onClick={pickDestFolder} className="gap-2">
                <FolderOutput className="h-4 w-4" />
                Chọn thư mục đích
              </Button>
              {destName ? (
                <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-muted/40 rounded-lg px-3 py-2 border">
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  {destName}
                  <span className="text-xs text-muted-foreground ml-auto">đã chọn</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa chọn thư mục đích</p>
              )}
            </div>
          )}

          {destMode === "subfolder" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Tên thư mục con:</label>
                <Input
                  value={subfolderName}
                  onChange={e => setSubfolderName(e.target.value)}
                  placeholder="Culled"
                  className="h-9 w-48 text-sm font-mono"
                />
              </div>
              <Button variant="outline" onClick={pickParentFolder} className="gap-2">
                <FolderPlus className="h-4 w-4" />
                Chọn thư mục cha
              </Button>
              {parentName ? (
                <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-muted/40 rounded-lg px-3 py-2 border">
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  <span>{parentName}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-primary font-semibold">{subfolderName || "..."}</span>
                  <span className="text-xs text-muted-foreground ml-auto">sẽ được tạo</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa chọn thư mục cha</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── STEP 4: Định dạng ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">Bước 4 — Định dạng file cần sao chép</span>
          <div className="flex gap-2">
            <button
              onClick={selectAllRaw}
              className="text-xs text-primary hover:underline font-medium"
            >
              Chọn tất cả RAW
            </button>
            <span className="text-muted-foreground text-xs">·</span>
            <button
              onClick={deselectAllRaw}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Bỏ chọn RAW
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6">
            {FORMAT_LIST.map(f => (
              <label
                key={f.key}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <Checkbox
                  checked={selectedFormats.has(f.key)}
                  onCheckedChange={() => toggleFormat(f.key)}
                  id={`fmt-${f.key}`}
                />
                <span className={`text-sm ${selectedFormats.has(f.key) ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {f.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── START BUTTON ── */}
      <Button
        className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50"
        disabled={!canStart}
        onClick={handleStart}
      >
        {isRunning ? (
          <span className="flex items-center gap-2">
            <span className="animate-pulse">⏳</span>
            Đang sao chép: {progress.done} / {progress.total} files...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Bắt đầu Lọc Ảnh
          </span>
        )}
      </Button>

      {!canStart && !isRunning && (
        <p className="text-xs text-center text-muted-foreground -mt-1">
          {fileNames.length === 0
            ? "⬆ Cần nhận danh sách ảnh từ tab Chọn Ảnh trước"
            : !srcHandle
            ? "⬆ Cần chọn thư mục nguồn"
            : selectedFormats.size === 0
            ? "⬆ Cần chọn ít nhất một định dạng"
            : "⬆ Cần chọn thư mục đích"}
        </p>
      )}

      {/* ── PROGRESS ── */}
      {isRunning && progress.total > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Đang sao chép...</span>
            <span className="text-primary font-semibold">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-3" />
          <p className="text-xs text-muted-foreground text-center">
            {progress.done} / {progress.total} files
          </p>
        </div>
      )}

      {/* ── RESULTS ── */}
      {results && !isRunning && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b">
            <span className="font-semibold text-sm">Kết quả</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="font-medium">
                Đã sao chép thành công <strong>{results.copied.length}</strong> file
                {results.copied.length !== 1 ? "s" : ""}
              </span>
            </div>

            {results.missing.length > 0 && (
              <div className="space-y-2">
                <button
                  className="w-full flex items-center gap-2 text-amber-700 font-medium text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 hover:bg-amber-100 transition-colors"
                  onClick={() => setMissingExpanded(v => !v)}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Không tìm thấy <strong>{results.missing.length}</strong> file trong thư mục nguồn
                  </span>
                  <span className="ml-auto">
                    {missingExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>

                {missingExpanded && (
                  <div className="bg-muted/40 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {results.missing.map((name, i) => (
                      <p key={i} className="text-xs font-mono text-muted-foreground py-0.5 border-b border-border/40 last:border-0">
                        {name}
                      </p>
                    ))}
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={exportMissing} className="gap-2">
                  <FileDown className="h-3.5 w-3.5" />
                  Xuất danh sách file không tìm thấy (.txt)
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

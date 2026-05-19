import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, FolderOpen, Upload, ChevronDown, ChevronUp, FileDown, Play, X } from "lucide-react";

interface LocAnhProps {
  selectedFileNames: string[];
}

const FORMAT_LIST = [
  { key: "JPG",  label: "JPG",              exts: ["jpg", "jpeg"], isRaw: false },
  { key: "NEF",  label: "NEF (Nikon RAW)",  exts: ["nef"],         isRaw: true  },
  { key: "CR2",  label: "CR2 (Canon RAW)",  exts: ["cr2"],         isRaw: true  },
  { key: "CR3",  label: "CR3 (Canon RAW)",  exts: ["cr3"],         isRaw: true  },
  { key: "ARW",  label: "ARW (Sony RAW)",   exts: ["arw"],         isRaw: true  },
  { key: "DNG",  label: "DNG",              exts: ["dng"],         isRaw: true  },
  { key: "RW2",  label: "RW2 (Panasonic)",  exts: ["rw2"],         isRaw: true  },
  { key: "ORF",  label: "ORF (Olympus)",    exts: ["orf"],         isRaw: true  },
  { key: "RAF",  label: "RAF (Fujifilm)",   exts: ["raf"],         isRaw: true  },
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
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(["JPG"]));
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<{ copied: string[]; missing: string[] } | null>(null);
  const [missingExpanded, setMissingExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleReceiveFromSelection() {
    setFileNames(selectedFileNames);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/[\r\n,]+/).map(l => l.trim()).filter(Boolean);
      setFileNames(lines);
    };
    reader.readAsText(file);
    e.target.value = "";
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
    if (!srcHandle) return;
    if (fileNames.length === 0) return;
    if (selectedFormats.size === 0) return;

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
      setResults({ copied: [], missing: ["Lỗi: " + (err?.message || err)] });
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
    a.download = "missing-files.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canStart =
    !isRunning &&
    fileNames.length > 0 &&
    srcHandle &&
    selectedFormats.size > 0 &&
    (destMode === "pick" ? !!destHandle : !!parentHandle && !!subfolderName.trim());

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (!isSupported) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-800">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <p className="text-sm">
            ⚠️ Tính năng <strong>Lọc Ảnh</strong> yêu cầu Chrome hoặc Edge trên máy tính (desktop).
            Vui lòng mở lại bằng Chrome.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* ── SECTION 1: Danh sách ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          📋 Danh sách file names
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReceiveFromSelection}
            disabled={selectedFileNames.length === 0}
          >
            Nhận từ Chọn Ảnh
            {selectedFileNames.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {selectedFileNames.length}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Tải file .txt / .csv
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          {fileNames.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setFileNames([])}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Xóa
            </Button>
          )}
        </div>
        {fileNames.length > 0 ? (
          <p className="text-sm text-green-700 font-medium">
            ✅ Đã nhận <strong>{fileNames.length}</strong> file names
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có danh sách nào</p>
        )}
      </div>

      {/* ── SECTION 2: Nguồn ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          📁 Thư mục nguồn (ảnh gốc)
        </h3>
        <Button variant="outline" size="sm" onClick={pickSrcFolder}>
          <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
          Chọn thư mục nguồn
        </Button>
        {srcName && (
          <p className="text-sm font-medium text-foreground">
            📂 {srcName}
          </p>
        )}
      </div>

      {/* ── SECTION 3: Đích ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          💾 Thư mục đích
        </h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="destMode"
              value="pick"
              checked={destMode === "pick"}
              onChange={() => setDestMode("pick")}
              className="accent-primary"
            />
            Chọn thư mục đích
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="destMode"
              value="subfolder"
              checked={destMode === "subfolder"}
              onChange={() => setDestMode("subfolder")}
              className="accent-primary"
            />
            Tạo thư mục con
          </label>
        </div>

        {destMode === "pick" && (
          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={pickDestFolder}>
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Chọn thư mục đích
            </Button>
            {destName && <p className="text-sm font-medium">📂 {destName}</p>}
          </div>
        )}

        {destMode === "subfolder" && (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">Tên thư mục con:</span>
              <Input
                value={subfolderName}
                onChange={e => setSubfolderName(e.target.value)}
                placeholder="Culled"
                className="h-8 w-40 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={pickParentFolder}>
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Chọn thư mục cha
            </Button>
            {parentName && (
              <p className="text-sm font-medium">
                📂 {parentName} / <span className="text-primary">{subfolderName || "..."}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 4: Định dạng ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          📷 Định dạng file
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2.5 gap-x-4">
          {FORMAT_LIST.map(f => (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={selectedFormats.has(f.key)}
                onCheckedChange={() => toggleFormat(f.key)}
                id={`fmt-${f.key}`}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={selectAllRaw}>
            Chọn tất cả RAW
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAllRaw}>
            Bỏ chọn RAW
          </Button>
        </div>
      </div>

      {/* ── START BUTTON ── */}
      <Button
        className="w-full h-12 text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        disabled={!canStart}
        onClick={handleStart}
      >
        <Play className="h-4 w-4 mr-2" />
        {isRunning ? `Đang copy: ${progress.done} / ${progress.total} files...` : "🚀 Bắt đầu Lọc Ảnh"}
      </Button>

      {/* ── PROGRESS ── */}
      {isRunning && progress.total > 0 && (
        <div className="space-y-2">
          <Progress value={progressPct} className="h-3" />
          <p className="text-sm text-center text-muted-foreground">
            {progressPct}% — {progress.done} / {progress.total} files
          </p>
        </div>
      )}

      {/* ── RESULTS ── */}
      {results && !isRunning && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Đã copy <strong>{results.copied.length}</strong> files thành công</span>
          </div>

          {results.missing.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-2 text-amber-700 font-medium text-sm w-full text-left"
                onClick={() => setMissingExpanded(v => !v)}
              >
                <AlertTriangle className="h-4 w-4" />
                Không tìm thấy <strong>{results.missing.length}</strong> files trong thư mục nguồn
                {missingExpanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
              </button>

              {missingExpanded && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {results.missing.map((name, i) => (
                    <p key={i} className="text-xs font-mono text-amber-800">{name}</p>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={exportMissing}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                Xuất danh sách thiếu (.txt)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

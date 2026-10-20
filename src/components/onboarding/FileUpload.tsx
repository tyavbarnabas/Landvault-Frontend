// One document to upload: PDF, JPG or PNG, up to 10 MB, checked here before
// it's accepted.

import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { FileCheckIcon, FileTextIcon } from "../icons";
import { useRef, useState } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileUploadProps {
  label: string;
  required?: boolean;
  helperText?: string;
  file: File | null | undefined;
  onChange: (file: File | null) => void;
  error?: string;
}

export default function FileUpload({ label, required, helperText, file, onChange, error }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState("");

  const validateAndSet = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED_TYPES[candidate.type]) {
      setLocalError("Only PDF, JPG, or PNG files are accepted.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setLocalError("File must be 10MB or smaller.");
      return;
    }
    setLocalError("");
    onChange(candidate);
  };

  const problem = localError || error;
  return (
    <div>
      {/* One row per document, from the Figma onboarding proposal: what it is,
          whether it's required, and — once chosen — the file itself. Drop a
          file anywhere on the row. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          validateAndSet(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-wrap sm:flex-nowrap items-center gap-3.5 rounded-lg border p-3.5 transition-colors ${
          problem ? "border-[var(--error-border)]" : dragOver ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"
        }`}
      >
        <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${file ? "bg-[var(--success-surface)] text-[var(--success-text)]" : "bg-[var(--secondary)] text-[var(--primary)]"}`}>
          {file ? <FileCheckIcon size={18} /> : <FileTextIcon size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">{label}</span>
            {required !== undefined && <Badge label={required ? "Required" : "Optional"} variant="neutral" />}
          </div>
          <div className={`text-xs mt-0.5 truncate ${file ? "font-mono-data text-[var(--muted-foreground)]" : "text-[var(--muted-foreground)]"}`}>
            {file ? `${file.name} · ${formatSize(file.size)}` : helperText ?? "PDF, JPG or PNG · up to 10 MB"}
          </div>
        </div>
        {file ? (
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="link" className="text-sm font-medium" onClick={() => inputRef.current?.click()}>Replace</Button>
            <Button variant="linkMuted" className="text-sm" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ""; }}>Remove</Button>
          </div>
        ) : (
          <Button variant="secondary" className="shrink-0" onClick={() => inputRef.current?.click()}>Choose file</Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={Object.keys(ACCEPTED_TYPES).join(",")}
          className="sr-only"
          aria-label={`${label}${required ? " (required)" : ""}`}
          onChange={(e) => validateAndSet(e.target.files?.[0])}
        />
      </div>
      {problem && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{problem}</p>}
    </div>
  );
}

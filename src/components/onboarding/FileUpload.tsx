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

  return (
    <div>
      <label className="flex items-baseline gap-1.5 mb-1">
        <span className="text-xs font-medium text-[var(--foreground)]">{label}</span>
        <span className={`text-[10px] ${required ? "text-red-600" : "text-[var(--muted-foreground)]"}`}>{required ? "Required" : "Optional"}</span>
      </label>
      {helperText && <p className="text-xs text-[var(--muted-foreground)] mb-2">{helperText}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          validateAndSet(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-4 py-6 transition-colors ${
          file ? "border-[var(--primary)] bg-[var(--secondary)]" : dragOver ? "border-[var(--primary)] bg-[var(--secondary)]/50" : "border-[var(--border)]"
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--foreground)] truncate">{file.name}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{formatSize(file.size)}</div>
            </div>
            <button type="button" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ""; }} className="text-xs text-red-600 hover:underline shrink-0">
              Remove
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-2 text-center">
              Drag &amp; drop, or{" "}
              <button type="button" onClick={() => inputRef.current?.click()} className="text-[var(--accent)] font-medium hover:underline">
                browse
              </button>
            </p>
            <p className="text-[10px] text-[var(--muted-foreground)]">PDF, JPG, or PNG · up to 10MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={Object.keys(ACCEPTED_TYPES).join(",")}
          className="sr-only"
          onChange={(e) => validateAndSet(e.target.files?.[0])}
        />
      </div>
      {(localError || error) && (
        <p role="alert" className="text-red-600 text-xs mt-1.5">{localError || error}</p>
      )}
    </div>
  );
}

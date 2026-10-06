// Import plots from a surveyor's GeoJSON file (FU-1..FU-3).
//
// Three steps, in the order a developer needs them: get the template (this
// estate's real tier names, and the property names the import reads), check a
// file — every problem reported at once, nothing written — then import. The
// import is ALL OR NOTHING and re-checks everything: a preview is not a promise.

import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { fetchPortalEstateById } from "../../../services/portalEstatesService";
import {
  PLOT_IMPORT_DEFAULTS, PLOT_IMPORT_LIMIT, fetchPlotImportTemplate, importPlots, previewPlotImport,
  type PlotImportIssue, type PlotImportOptions, type PlotImportReport,
} from "../../../services/portalInventoryService";
import StatusBadge from "../../../components/StatusBadge";
import { Field, inputClass } from "../../../components/portal/formParts";
import { usePortalScope } from "../usePortalScope";

// What each backend issue code means in a developer's terms. The server's own
// message is always shown too; this is the "what to do about it".
const ISSUE_HINTS: Record<string, string> = {
  PROJECTED_COORDINATES: "Survey software usually exports UTM metres. Re-export in WGS 84 (EPSG:4326).",
  OUTSIDE_ESTATE: "Often longitude and latitude swapped — they must be [longitude, latitude].",
  UNKNOWN_TIER: "Use a tier's label, or a land tier's size in sqm, exactly as in the template.",
  AMBIGUOUS_TIER: "Give the tier's label rather than its size.",
  TIER_RETIRED: "Retired tiers accept no new plots. Reinstate it, or use another tier.",
};

export default function ImportPortalPlots() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const estate = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PlotImportOptions["status"]>("available-dev");
  const [columns, setColumns] = useState<Record<keyof typeof PLOT_IMPORT_DEFAULTS, string>>({ ...PLOT_IMPORT_DEFAULTS });
  const [preview, setPreview] = useState<PlotImportReport | null>(null);
  const [result, setResult] = useState<PlotImportReport | null>(null);
  const [busy, setBusy] = useState<"template" | "preview" | "import" | null>(null);
  const [error, setError] = useState("");

  if (estate.loading) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  if (!estate.data || !estateId || !scope) {
    return (
      <div className="p-8">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">Estate not found.</p>
        <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>
      </div>
    );
  }

  const options: PlotImportOptions = { status, ...columns };

  const downloadTemplate = async () => {
    setBusy("template");
    setError("");
    try {
      const text = await fetchPlotImportTemplate(estateId, scope);
      const url = URL.createObjectURL(new Blob([text], { type: "application/geo+json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${estate.data!.slug || "estate"}-plots-template.geojson`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't download the template. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  // Any change to the file or the options makes an earlier check stale.
  const invalidate = () => { setPreview(null); setResult(null); setError(""); };

  const check = async () => {
    if (!file) return;
    setBusy("preview");
    setError("");
    setResult(null);
    try {
      setPreview(await previewPlotImport(estateId, file, options, scope));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the file.");
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy("import");
    setError("");
    try {
      const report = await importPlots(estateId, file, options, scope);
      setResult(report);
      // A refused import came back with the fresh report; show that instead
      // of the older preview.
      if (!report.imported) setPreview(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import the file.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to={`/portal/estates/${estateId}/inventory?tab=plots`} className="text-xs text-[var(--accent)] hover:underline">← Inventory</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Import plots from a file</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        A GeoJSON file from your surveyor, one shape per plot — up to {PLOT_IMPORT_LIMIT} per file. Coordinates must be longitude then
        latitude in WGS 84, not UTM metres (the usual export from Nigerian survey software — re-export it in QGIS).
      </p>

      {result?.imported ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3" role="status">
          <div className="flex items-center gap-3">
            <StatusBadge label="Imported" variant="success" />
            <p className="text-sm font-medium text-[var(--foreground)]">{result.createdCount} {result.createdCount === 1 ? "plot" : "plots"} created.</p>
          </div>
          {result.blocksToCreate.length > 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">New blocks: {result.blocksToCreate.join(", ")}.</p>
          )}
          {result.plotOverlapsInEstate !== null && result.plotOverlapsInEstate > 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {result.plotOverlapsInEstate} overlapping {result.plotOverlapsInEstate === 1 ? "pair" : "pairs"} of plots were recorded for review.
            </p>
          )}
          <Link to={`/portal/estates/${estateId}/inventory?tab=plots`} className="inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
            See the plots →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">1. Start from the template</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              It lists this estate's tiers and the property names the import reads (<code>plot_number</code>, <code>block</code>,{" "}
              <code>tier</code>, <code>corner</code>), with two example plots to replace.
            </p>
            <button type="button" onClick={downloadTemplate} disabled={busy !== null}
              className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
              {busy === "template" ? "Preparing…" : "Download template"}
            </button>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">2. Choose the file and check it</h2>
            <div>
              <input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" id="import-file"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); invalidate(); }} />
              <label htmlFor="import-file" className="inline-block cursor-pointer px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
                {file ? "Choose a different file" : "Choose file"}
              </label>
              {file && <span className="ml-3 text-sm text-[var(--foreground)]">{file.name}</span>}
            </div>

            <Field id="import-status" label="Imported plots are"
              hint="Every plot in the file gets this. Reserved and sold are reached only through checkout.">
              <select id="import-status" value={status} onChange={(e) => { setStatus(e.target.value as PlotImportOptions["status"]); invalidate(); }} className={inputClass}>
                <option value="available-dev">Available — development</option>
                <option value="available-inv">Available — investment</option>
              </select>
            </Field>

            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--muted-foreground)]">My file uses different property names</summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {(Object.keys(PLOT_IMPORT_DEFAULTS) as (keyof typeof PLOT_IMPORT_DEFAULTS)[]).map((key) => (
                  <Field key={key} id={`col-${key}`} label={COLUMN_LABELS[key]}>
                    <input id={`col-${key}`} value={columns[key]} className={inputClass}
                      onChange={(e) => { setColumns({ ...columns, [key]: e.target.value }); invalidate(); }} />
                  </Field>
                ))}
              </div>
            </details>

            <button type="button" onClick={check} disabled={!file || busy !== null}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {busy === "preview" ? "Checking…" : "Check file"}
            </button>
            <p className="text-xs text-[var(--muted-foreground)]">Checking writes nothing.</p>
          </section>

          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

          {preview && (
            <ImportReport
              report={preview}
              refused={result !== null && !result.imported}
              importing={busy === "import"}
              onImport={runImport}
            />
          )}
        </div>
      )}
    </div>
  );
}

const COLUMN_LABELS: Record<keyof typeof PLOT_IMPORT_DEFAULTS, string> = {
  plotNumberProperty: "Plot number property",
  blockProperty: "Block property",
  tierProperty: "Tier property",
  cornerProperty: "Corner property",
};

function ImportReport({ report, refused, importing, onImport }: {
  report: PlotImportReport; refused: boolean; importing: boolean; onImport: () => void;
}) {
  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4" aria-label="Check results">
      <div className="flex items-center gap-3">
        <StatusBadge label={report.canImport ? "Ready to import" : `${report.errors.length} ${report.errors.length === 1 ? "problem" : "problems"} to fix`}
          variant={report.canImport ? "success" : "error"} />
        <p className="text-sm text-[var(--foreground)]">
          {report.importableCount} of {report.featureCount} {report.featureCount === 1 ? "plot" : "plots"} can be imported.
        </p>
      </div>

      {refused && (
        <p className="text-sm text-red-700" role="alert">
          The import was refused and nothing was created — the file was checked again and has the problems below.
        </p>
      )}

      {Object.keys(report.plotsPerTier).length > 0 && (
        <div className="text-sm text-[var(--foreground)]">
          <div className="text-xs text-[var(--muted-foreground)] mb-1">Plots per tier</div>
          <ul className="space-y-0.5">
            {Object.entries(report.plotsPerTier).map(([tier, count]) => <li key={tier}>{tier}: {count}</li>)}
          </ul>
        </div>
      )}
      {report.blocksToCreate.length > 0 && (
        <p className="text-sm text-[var(--foreground)]">New blocks that will be created: {report.blocksToCreate.join(", ")}.</p>
      )}

      {report.errors.length > 0 && <IssueList title="Problems — these stop the import" issues={report.errors} tone="error" />}
      {report.warnings.length > 0 && <IssueList title="Warnings — these don't stop it" issues={report.warnings} tone="warning" />}
      {report.note && <p className="text-xs text-[var(--muted-foreground)]">{report.note}</p>}

      {report.canImport ? (
        <div className="space-y-2">
          <button type="button" onClick={onImport} disabled={importing}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {importing ? "Importing…" : `Import ${report.importableCount} ${report.importableCount === 1 ? "plot" : "plots"}`}
          </button>
          <p className="text-xs text-[var(--muted-foreground)]">
            All or nothing: everything is checked again, and if anything has changed since this check, nothing is created.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing can be imported until every problem is fixed — a half-imported estate is worse than none. Fix the file and check it again.
        </p>
      )}
    </section>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: PlotImportIssue[]; tone: "error" | "warning" }) {
  return (
    <div>
      <div className={`text-xs font-semibold mb-1 ${tone === "error" ? "text-red-700" : "text-amber-700"}`}>{title}</div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--muted)] text-left">
              <th scope="col" className="px-3 py-2 font-medium text-[var(--muted-foreground)]">Plot</th>
              <th scope="col" className="px-3 py-2 font-medium text-[var(--muted-foreground)]">Problem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {issues.map((issue, i) => (
              <tr key={i}>
                <td className="px-3 py-2 align-top text-[var(--foreground)] whitespace-nowrap">
                  {issue.feature === null ? "Whole file" : `#${issue.feature}${issue.plotNumber ? ` · ${issue.plotNumber}` : ""}`}
                </td>
                <td className="px-3 py-2 text-[var(--foreground)]">
                  {issue.message}
                  {ISSUE_HINTS[issue.code] && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{ISSUE_HINTS[issue.code]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

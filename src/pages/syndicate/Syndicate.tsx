import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { formatAmount, type Estate } from "../../data/mockData";
import { fetchEstates, fetchPriceTiers, type PriceTier } from "../../services/estatesService";
import { toListingPlot, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import { fetchSyndicates, fetchSyndicateById, createSyndicate, type Syndicate } from "../../services/syndicatesService";
import { useApp } from "../../contexts/AppContext";
import PlotCanvas from "../../components/PlotCanvas";

// ─── Syndicate dashboard ───────────────────────────────────────────────────

export function SyndicateList() {
  const { currency } = useApp();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [syndicates, setSyndicates] = useState<Syndicate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEstates(), fetchSyndicates()]).then(([ests, syns]) => {
      if (cancelled) return;
      setEstates(ests);
      setSyndicates(syns);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Co-ownership</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Pool funds with others to co-purchase a plot. Each member's equity is tracked and certificated separately.</p>
        </div>
        <Link to="/syndicates/new" className="shrink-0 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          + Create syndicate
        </Link>
      </div>

      {syndicates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🤝</div>
          <h2 className="font-semibold text-[var(--foreground)] mb-1">No syndicates yet</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-5">Create a syndicate and invite co-investors, or join one with an invite link.</p>
          <Link to="/syndicates/new" className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            Create your first syndicate
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {syndicates.map((syn) => {
            const estate = estates.find((e) => e.id === syn.estateId)!;
            const totalPaid = syn.members.filter((m) => m.status === "joined").reduce((s, m) => s + m.contributed, 0);
            const pct = Math.round((totalPaid / syn.totalPrice) * 100);
            return (
              <Link
                key={syn.id}
                to={`/syndicates/${syn.id}`}
                className="block bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--accent)]/50 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--muted)] shrink-0">
                    <img src={estate.imageUrl} alt={estate.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--foreground)]">{syn.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{estate.name} · {syn.plotLabel} · {syn.sqm} sqm</div>
                  </div>
                  <StatusPill status={syn.status} />
                </div>

                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">Equity raised</span>
                  <span className="font-mono-data">{formatAmount(totalPaid, currency)} / {formatAmount(syn.totalPrice, currency)} ({pct}%)</span>
                </div>
                <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center gap-2">
                  {syn.members.map((m) => (
                    <div key={m.id} title={`${m.name} (${m.pct}%)`} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${m.status === "joined" ? "bg-[var(--primary)] text-white border-[var(--card)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"}`}>
                      {m.name.charAt(0)}
                    </div>
                  ))}
                  <span className="text-xs text-[var(--muted-foreground)] ml-1">{syn.members.length} members</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Join by invite */}
      <div className="mt-8 bg-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-6">
        <h3 className="font-semibold text-sm mb-2">Have an invite?</h3>
        <div className="flex gap-2">
          <input placeholder="Paste invite link or code…" className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]" />
          <button className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">Join</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create syndicate ──────────────────────────────────────────────────────

export function CreateSyndicate() {
  const navigate = useNavigate();
  const { currency } = useApp();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [step, setStep] = useState<"name" | "plot" | "members" | "done">("name");
  const [synName, setSynName] = useState("");
  const [selectedEstate, setSelectedEstate] = useState("");
  const [selectedPlot, setSelectedPlot] = useState<ListingPlot | null>(null);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [members, setMembers] = useState<{ email: string; pct: number }[]>([
    { email: "", pct: 0 },
  ]);
  const [ownerPct, setOwnerPct] = useState(40);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEstates().then((data) => { if (!cancelled) { setEstates(data); setSelectedEstate((prev) => prev || data[0]?.id || ""); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedEstate) return;
    let cancelled = false;
    fetchPriceTiers(selectedEstate).then((t) => { if (!cancelled) setTiers(t); });
    return () => { cancelled = true; };
  }, [selectedEstate]);

  if (estates.length === 0) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;

  const estate = estates.find((e) => e.id === selectedEstate)!;
  const listingPlots = estate.plots.map((p) => toListingPlot(estate.id, p));
  const selectedPlotPrice = selectedPlot ? priceForPlot(selectedPlot, tiers, estate.cornerPremiumPct).final : 0;
  const otherPct = members.reduce((s, m) => s + m.pct, 0);
  const totalPct = ownerPct + otherPct;

  const addMember = () => setMembers((m) => [...m, { email: "", pct: 0 }]);
  const updateMember = (i: number, key: "email" | "pct", val: string | number) => {
    setMembers((prev) => prev.map((m, idx) => idx === i ? { ...m, [key]: val } : m));
  };
  const removeMember = (i: number) => setMembers((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (totalPct !== 100 || !selectedPlot) return;
    setCreating(true);
    try {
      const syndicate = await createSyndicate({
        name: synName,
        estateId: estate.id,
        plotId: selectedPlot.id,
        plotLabel: `Plot ${selectedPlot.row + 1}-${selectedPlot.col + 1}`,
        sqm: selectedPlot.sizeSqm,
        totalPrice: selectedPlotPrice,
        ownerPct,
        invitedMembers: members.filter((m) => m.email.trim()),
      });
      setCreatedId(syndicate.id);
      setStep("done");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/syndicates" className="hover:text-[var(--foreground)]">Co-ownership</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">Create syndicate</span>
      </nav>
      <h1 className="font-display text-2xl mb-6">Create a syndicate</h1>

      {/* Progress */}
      {step !== "done" && (
        <div className="flex gap-1 mb-6">
          {(["name", "plot", "members"] as const).map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${["name", "plot", "members"].indexOf(step) >= i ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
          ))}
        </div>
      )}

      {step === "name" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Syndicate name</label>
            <input value={synName} onChange={(e) => setSynName(e.target.value)} placeholder="e.g. Abuja Diaspora Group" className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm bg-[var(--card)]" />
          </div>
          <button onClick={() => synName && setStep("plot")} disabled={!synName} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
            Continue →
          </button>
        </div>
      )}

      {step === "plot" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Select estate</label>
            <div className="grid gap-2">
              {estates.map((e) => (
                <button key={e.id} onClick={() => { setSelectedEstate(e.id); setSelectedPlot(null); }} className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${selectedEstate === e.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--muted)] shrink-0">
                    <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{e.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">From {formatAmount(e.priceFrom, currency)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedEstate && (
            <div>
              <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Select a plot</div>
              <PlotCanvas estateId={estate.id} plots={listingPlots} tiers={tiers} cornerPremiumPct={estate.cornerPremiumPct} onSelectPlot={setSelectedPlot} selectedPlotId={selectedPlot?.id} />
              {selectedPlot && (
                <div className="mt-2 p-3 bg-[var(--secondary)] rounded-lg text-sm flex items-center justify-between">
                  <span className="font-medium">Plot {selectedPlot.row + 1}-{selectedPlot.col + 1} · {selectedPlot.sizeSqm} sqm</span>
                  <span className="font-mono-data font-semibold">{formatAmount(selectedPlotPrice, currency)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep("name")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">← Back</button>
            <button onClick={() => setStep("members")} disabled={!selectedPlot} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
              Set up members →
            </button>
          </div>
        </div>
      )}

      {step === "members" && selectedPlot && (
        <div className="space-y-5">
          {/* Your share */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <div className="font-semibold text-sm mb-3">Ownership split</div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Your share</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={ownerPct}
                  onChange={(e) => setOwnerPct(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm border border-[var(--border)] rounded text-center font-mono-data"
                />
                <span className="text-sm text-[var(--muted-foreground)]">%</span>
              </div>
            </div>

            {/* Member rows */}
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  value={m.email}
                  onChange={(e) => updateMember(i, "email", e.target.value)}
                  placeholder="Member email"
                  className="flex-1 px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={m.pct}
                  onChange={(e) => updateMember(i, "pct", Number(e.target.value))}
                  className="w-16 px-2 py-1.5 text-sm border border-[var(--border)] rounded text-center font-mono-data"
                />
                <span className="text-sm text-[var(--muted-foreground)]">%</span>
                <button onClick={() => removeMember(i)} className="text-[var(--muted-foreground)] hover:text-red-500 text-lg leading-none">×</button>
              </div>
            ))}
            <button onClick={addMember} className="text-xs text-[var(--accent)] hover:underline mt-1">+ Add member</button>

            <div className={`mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-sm font-medium ${totalPct !== 100 ? "text-red-600" : "text-emerald-700"}`}>
              <span>Total</span>
              <span className="font-mono-data">{totalPct}% {totalPct !== 100 ? "(must equal 100%)" : "✓"}</span>
            </div>
          </div>

          <div className="p-3 bg-[var(--muted)] rounded-lg text-xs text-[var(--muted-foreground)] leading-relaxed">
            Individual equity certificates will be generated for each member into their own vaults. Changes to the split after confirmation require unanimous agreement.
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("plot")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">← Back</button>
            <button
              onClick={handleCreate}
              disabled={totalPct !== 100 || creating}
              className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {creating ? "Creating…" : "Create syndicate"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-10">
          <div className="text-4xl mb-4">🤝</div>
          <h2 className="font-display text-2xl mb-2">Syndicate created</h2>
          <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
            <strong>{synName}</strong> is set up. Invite links have been sent to members. Each member funds their share before the plot is reserved.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/syndicates" className="px-5 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors">
              View syndicates
            </Link>
            <Link to={`/syndicates/${createdId}`} className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              Open dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Syndicate detail dashboard ────────────────────────────────────────────

export function SyndicateDetail() {
  const { id } = useParams();
  const { currency } = useApp();
  const navigate = useNavigate();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [syn, setSyn] = useState<Syndicate | null | undefined>(undefined); // undefined = loading, null = not found

  useEffect(() => {
    if (!id) { setSyn(null); return; }
    let cancelled = false;
    fetchEstates().then((data) => { if (!cancelled) setEstates(data); });
    fetchSyndicateById(id).then((data) => { if (!cancelled) setSyn(data ?? null); });
    return () => { cancelled = true; };
  }, [id]);

  if (syn === undefined || estates.length === 0) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (!syn) return <div className="p-8">Syndicate not found.</div>;

  const estate = estates.find((e) => e.id === syn.estateId)!;
  const totalPaid = syn.members.filter((m) => m.status === "joined").reduce((s, m) => s + m.contributed, 0);
  const pct = syn.totalPrice > 0 ? Math.round((totalPaid / syn.totalPrice) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/syndicates" className="hover:text-[var(--foreground)]">Co-ownership</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{syn.name}</span>
      </nav>

      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="font-display text-2xl mb-0.5">{syn.name}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{estate.name} · {syn.plotLabel} · {syn.sqm} sqm</p>
        </div>
        <StatusPill status={syn.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Equity progress */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Group equity</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="Total price" value={formatAmount(syn.totalPrice, currency)} />
              <Stat label="Raised" value={formatAmount(totalPaid, currency)} green />
              <Stat label="Outstanding" value={formatAmount(syn.totalPrice - totalPaid, currency)} />
            </div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Funded</span>
              <span className="font-mono-data">{pct}%</span>
            </div>
            <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Members table */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="font-semibold text-sm">Members & ownership</h3>
              <button className="text-xs text-[var(--accent)] hover:underline">+ Invite</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Member</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Share</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Contributed</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {syn.members.map((m) => (
                  <tr key={m.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{m.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-data font-medium">{m.pct}%</td>
                    <td className="px-4 py-3 text-right font-mono-data text-xs">{formatAmount(m.contributed, currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.status === "joined" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {/* Plot info */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="h-28 overflow-hidden bg-[var(--muted)]">
              <img src={estate.imageUrl} alt={estate.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-4">
              <div className="font-semibold text-sm mb-0.5">{estate.name}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{syn.plotLabel} · {syn.sqm} sqm</div>
              <Link to={`/estates/${estate.id}`} className="text-xs text-[var(--accent)] hover:underline mt-2 inline-block">View on map →</Link>
            </div>
          </div>

          {/* Invite link */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-semibold text-sm mb-2">Invite link</h3>
            <div className="bg-[var(--muted)] rounded px-3 py-2 text-xs font-mono-data break-all text-[var(--muted-foreground)] mb-2">
              landvault.app/join/syn-001-abc123
            </div>
            <button className="text-xs text-[var(--accent)] hover:underline">Copy link</button>
          </div>

          {/* Equity certificates */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-semibold text-sm mb-2">Equity certificates</h3>
            <div className="space-y-2">
              {syn.members.filter((m) => m.status === "joined").map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span>{m.name} ({m.pct}%)</span>
                  <button className="text-[var(--accent)] hover:underline">↓ PDF</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s: Record<string, string> = {
    forming: "bg-amber-50 text-amber-700 border-amber-200",
    active: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={`text-xs font-medium px-3 py-1 rounded-full border capitalize ${s[status] || ""}`}>{status}</span>
  );
}

function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{label}</div>
      <div className={`font-semibold font-mono-data text-sm ${green ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}

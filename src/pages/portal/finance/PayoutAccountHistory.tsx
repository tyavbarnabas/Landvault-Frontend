// Every payout account the company has submitted, newest first —
// /portal/payout-account/history (portal.settlement.manage). The Payout
// account page shows no history itself, only a link here beside the change
// form, so the form never ends up buried under a long list.
//
// The backend returns the whole history in one response (GET
// /api/portal/settlement/account), so paging is done here. The current page
// lives in ?page= so Back and a shared link land on the same page.

import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import LoadError from "../../../components/LoadError";
import SettlementHistoryItem from "../../../components/payments/SettlementHistoryItem";
import Page, { Loading } from "../../../components/ui/Page";
import EmptyState from "../../../components/ui/EmptyState";
import Pagination from "../../../components/ui/Pagination";
import { fetchCompanySettlement } from "../../../services/settlementService";

const PAGE_SIZE = 10;

export default function PayoutAccountHistory() {
  const loaded = useFetch(() => fetchCompanySettlement(), []);
  const [params, setParams] = useSearchParams();

  const history = loaded.data?.history ?? [];
  const pages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pages);
  const shown = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let body: React.ReactNode;
  if (loaded.loading && !loaded.data) body = <Loading />;
  else if (loaded.error) {
    const code = loaded.errorValue instanceof ApiError ? loaded.errorValue.body?.code : undefined;
    body = code === "SETTLEMENT_REQUIRES_COMPANY_WIDE_SCOPE" || code === "COMPANY_SCOPE_REQUIRED"
      ? <EmptyState title="The payout account is company-wide" description="Your account works inside one branch, so you can't see where HomeTrue pays the company." />
      : <LoadError error={loaded.errorValue} what="your payout account history" onRetry={loaded.refetch} />;
  } else if (history.length === 0) {
    body = <EmptyState title="No payout accounts yet" description="Accounts appear here once you submit one." />;
  } else {
    body = (
      <>
        <ul className="space-y-3">{shown.map((a) => <SettlementHistoryItem key={a.id} account={a} />)}</ul>
        <Pagination page={page} pageSize={PAGE_SIZE} total={history.length} label="Payout account history pages"
          onPage={(p) => { setParams(p === 1 ? {} : { page: String(p) }); window.scrollTo({ top: 0 }); }} />
      </>
    );
  }

  return (
    <Page title="Payout account history" back={{ to: "/portal/payout-account", label: "Payout account" }}
      description="Every account your company has submitted, and what HomeTrue decided.">
      <div className="space-y-3">{body}</div>
    </Page>
  );
}

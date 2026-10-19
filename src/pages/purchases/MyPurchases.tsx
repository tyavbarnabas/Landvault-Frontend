// /purchases — every purchase the buyer has made, newest first. Where a buyer
// lands to find a refund or a payment from any device (the refund emails say
// "sign in to LandVault"; this is where that leads).

import PurchaseList from "../../components/purchases/PurchaseList";
import Page from "../../components/ui/Page";
import { LinkButton } from "../../components/ui/Button";
import { isAvailable } from "../../lib/backends";

export default function MyPurchases() {
  return (
    <Page title="My purchases"
      description="Every plot you've reserved or paid for. A plot is yours once the developer verifies your payment."
      actions={isAvailable("portfolio") ? <LinkButton to="/portfolio" variant="secondary">View portfolio</LinkButton> : undefined}>
      <PurchaseList pageSize={20} />
    </Page>
  );
}

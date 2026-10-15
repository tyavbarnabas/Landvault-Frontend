// A refused Super Admin money action, said plainly — with a way to turn
// two-factor on when that's what's missing (payouts and refunds need it).

import TextLink from "../ui/TextLink";
import { ErrorText } from "../ui/Field";

export interface MoneyProblem {
  message: string;
  // Two-factor isn't on: link to set it up.
  needsTwoFactor?: boolean;
}

export default function ProblemNote({ problem }: { problem: MoneyProblem }) {
  return (
    <ErrorText>
      {problem.message}
      {problem.needsTwoFactor && <> <TextLink to="/security/two-factor" className="font-semibold">Set up two-factor</TextLink></>}
    </ErrorText>
  );
}

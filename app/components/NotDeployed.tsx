import { Notice } from "./ui";

export function NotDeployed() {
  return (
    <Notice tone="pending" title="Not live on this network yet">
      The contract has not been deployed for the configured network, so there is nothing to read
      yet. You can still look around.
    </Notice>
  );
}

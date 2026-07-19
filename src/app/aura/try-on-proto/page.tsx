// PROTOTYPE ROUTE — throwaway. Hosts the issue-85 link-input UX variants
// WITHOUT the auth + portrait gate that guards the real /aura/try-on, so the
// composer design can be judged in a fresh dev server. Delete with the branch.

import { Suspense } from "react";

import {
  VariantA,
  VariantB,
  VariantC,
} from "@/components/aura/_proto/link-input-variants";
import { PrototypeSwitcher } from "@/components/aura/_proto/prototype-switcher";

const VARIANTS = [
  { key: "A", name: "Ghost tile + corner badge · inline" },
  { key: "B", name: "Brand tile + footer label · toast" },
  { key: "C", name: "Pending chip + ring badge · hybrid" },
];

export default async function TryOnProtoPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  const key = variant ?? "A";

  return (
    <>
      {key === "B" ? <VariantB /> : key === "C" ? <VariantC /> : <VariantA />}
      <Suspense>
        <PrototypeSwitcher variants={VARIANTS} />
      </Suspense>
    </>
  );
}

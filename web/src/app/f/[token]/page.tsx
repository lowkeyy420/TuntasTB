import type { Metadata } from "next";
import { copy } from "@/copy/family.id";
import { FamilyGate } from "./FamilyGate";

export const metadata: Metadata = {
  title: copy.home.title,
};

export default async function FamilyHome({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FamilyGate token={token} />;
}

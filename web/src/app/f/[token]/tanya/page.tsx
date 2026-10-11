import type { Metadata } from "next";
import { copy } from "@/copy/family.id";
import { AskGate } from "./AskGate";

export const metadata: Metadata = {
  title: copy.ask.title,
};

export default async function AskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AskGate token={token} />;
}

import Link from "next/link";
import { copy } from "@/copy/family.id";

/** Neutral public landing: no mention of the illness, one link to the nurse login. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold">{copy.landing.title}</h1>
      <p className="text-xl">{copy.landing.body}</p>
      <Link
        href="/login"
        className="inline-flex min-h-12 items-center text-lg text-teal-800 underline"
      >
        {copy.landing.nurseLogin}
      </Link>
    </main>
  );
}

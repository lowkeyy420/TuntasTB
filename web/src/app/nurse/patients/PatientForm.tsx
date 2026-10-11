"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/copy/nurse.id";
import { todayJakarta } from "@/lib/time";
import { fieldErrors, registrationSchema } from "@/lib/patients/schema";
import { LinkModal } from "./LinkModal";

type Errors = Record<string, string>;

/**
 * Registration form: five inputs, one screen. There is deliberately no name,
 * birth date, address or NIK input; the patient code is the only identifier.
 */
export function PatientForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const t = copy.patients.form;
  const today = todayJakarta();

  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [phase, setPhase] = useState("intensive");
  const [pickup, setPickup] = useState("14");
  const [pmoPhone, setPmoPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function payload() {
    return {
      code,
      startDate,
      phase,
      pickupIntervalDays: pickup.trim() === "" ? undefined : Number(pickup),
      pmoPhone: pmoPhone.trim() === "" ? undefined : pmoPhone,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registrationSchema(today).safeParse(payload());
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/nurse/patients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok && typeof body.familyLink === "string") {
        setLink(body.familyLink);
        return;
      }
      setErrors(body.fields ?? { _form: copy.patients.actionFailed });
    } catch {
      setErrors({ _form: copy.patients.actionFailed });
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    setLink(null);
    if (onDone) onDone();
    else router.push("/nurse/patients");
  }

  const inputCls = "mt-1 w-full rounded border border-black/30 px-3 py-3 text-lg";
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} role="alert" className="mt-1 text-base text-red-700">
        {errors[k]}
      </p>
    ) : null;

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {errors._form && (
          <p role="alert" className="text-base text-red-700">
            {errors._form}
          </p>
        )}

        <label className="block text-lg">
          {t.codeLabel}
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={20}
            aria-describedby="code-hint code-error"
            aria-invalid={Boolean(errors.code)}
            className={inputCls}
          />
          <span id="code-hint" className="block text-sm text-black/60">
            {t.codeHint}
          </span>
        </label>
        {err("code")}

        <label className="block text-lg">
          {t.startDateLabel}
          <input
            name="startDate"
            type="date"
            max={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-describedby="startDate-error"
            aria-invalid={Boolean(errors.startDate)}
            className={inputCls}
          />
        </label>
        {err("startDate")}

        <label className="block text-lg">
          {t.phaseLabel}
          <select
            name="phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className={inputCls}
          >
            <option value="intensive">{t.phaseIntensive}</option>
            <option value="continuation">{t.phaseContinuation}</option>
          </select>
        </label>
        {err("phase")}

        <label className="block text-lg">
          {t.pickupLabel}
          <input
            name="pickupIntervalDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            aria-describedby="pickup-hint pickupIntervalDays-error"
            aria-invalid={Boolean(errors.pickupIntervalDays)}
            className={inputCls}
          />
          <span id="pickup-hint" className="block text-sm text-black/60">
            {t.pickupHint}
          </span>
        </label>
        {err("pickupIntervalDays")}

        <label className="block text-lg">
          {t.pmoLabel}
          <input
            name="pmoPhone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={pmoPhone}
            onChange={(e) => setPmoPhone(e.target.value)}
            aria-describedby="pmo-hint pmoPhone-error"
            aria-invalid={Boolean(errors.pmoPhone)}
            className={inputCls}
          />
          <span id="pmo-hint" className="block text-sm text-black/60">
            {t.pmoHint}
          </span>
        </label>
        {err("pmoPhone")}

        <button
          type="submit"
          disabled={busy}
          className="min-h-12 w-full rounded bg-teal-700 px-4 text-lg font-medium text-white disabled:opacity-50"
        >
          {busy ? t.submitting : t.submit}
        </button>
      </form>

      {link && <LinkModal link={link} onClose={closeModal} />}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/copy/nurse.id";
import { todayJakarta } from "@/lib/time";
import { fieldErrors, registrationSchema } from "@/lib/patients/schema";
import { UserPlus } from "lucide-react";
import { Alert, Button, Card, TextInput, Select } from "@/components/ui";
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

  return (
    <>
      <Card>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {errors._form && (
            <Alert tone="danger" role="alert">
              {errors._form}
            </Alert>
          )}

          <TextInput
            label={t.codeLabel}
            hint={t.codeHint}
            error={errors.code}
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={20}
          />

          <TextInput
            label={t.startDateLabel}
            error={errors.startDate}
            name="startDate"
            type="date"
            max={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <Select
            label={t.phaseLabel}
            error={errors.phase}
            name="phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="intensive">{t.phaseIntensive}</option>
            <option value="continuation">{t.phaseContinuation}</option>
          </Select>

          <TextInput
            label={t.pickupLabel}
            hint={t.pickupHint}
            error={errors.pickupIntervalDays}
            name="pickupIntervalDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
          />

          <TextInput
            label={t.pmoLabel}
            hint={t.pmoHint}
            error={errors.pmoPhone}
            name="pmoPhone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={pmoPhone}
            onChange={(e) => setPmoPhone(e.target.value)}
          />

          <Button type="submit" block icon={UserPlus} loading={busy}>
            {busy ? t.submitting : t.submit}
          </Button>
        </form>
      </Card>

      {link && <LinkModal link={link} onClose={closeModal} />}
    </>
  );
}

import type { ReactNode } from "react";
import { Check, CircleDashed, Frown, Send, Thermometer, UserPlus, Users, X } from "lucide-react";
import { copy } from "@/copy/design.id";
import { copy as family } from "@/copy/family.id";
import {
  Alert,
  BottomActionBar,
  Button,
  ButtonLink,
  Card,
  Chip,
  ChipGroup,
  DateTile,
  EmptyState,
  PageHeader,
  RadioCardGroup,
  Select,
  StatusPill,
  StepIndicator,
  TextArea,
  TextInput,
  ToggleChip,
  TriageBadge,
  type ButtonVariant,
} from "@/components/ui";
import { mockToday } from "./mockups/data";

const t = copy.components;
const s = t.sample;

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function States({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "grid gap-6 md:grid-cols-2" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-4"}>
      {children}
    </div>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

const doseOptions = [
  { value: "yes", label: family.checkin.dose.yes, icon: Check },
  { value: "no", label: family.checkin.dose.no, icon: X },
  { value: "partial", label: family.checkin.dose.partial, icon: CircleDashed },
] as const;

const buttonRows: Array<{ variant: ButtonVariant; name: string }> = [
  { variant: "primary", name: t.names.buttonPrimary },
  { variant: "secondary", name: t.names.buttonSecondary },
  { variant: "danger", name: t.names.buttonDanger },
  { variant: "quiet", name: t.names.buttonQuiet },
];

/** Every component in every state. Forced states use the same CSS the real states use. */
export function ComponentStates() {
  return (
    <div className="flex flex-col gap-8">
      <Specimen title={t.names.button}>
        {buttonRows.map(({ variant, name }) => (
          <div key={variant} className="flex flex-col gap-3">
            <p className="text-base font-semibold text-ink">{name}</p>
            <States>
              <State label={t.states.default}>
                <Button variant={variant} icon={Send}>
                  {s.button}
                </Button>
              </State>
              <State label={t.states.hover}>
                <Button variant={variant} icon={Send} data-preview="hover">
                  {s.button}
                </Button>
              </State>
              <State label={t.states.focus}>
                <Button variant={variant} icon={Send} data-preview="focus">
                  {s.button}
                </Button>
              </State>
              <State label={t.states.disabled}>
                <Button variant={variant} icon={Send} disabled>
                  {s.button}
                </Button>
              </State>
            </States>
          </div>
        ))}
        <div className="flex flex-col gap-3">
          <p className="text-base font-semibold text-ink">{t.names.buttonSizes}</p>
          <States>
            <State label={s.large}>
              <Button size="lg">{s.button}</Button>
            </State>
            <State label={s.medium}>
              <Button size="md">{s.button}</Button>
            </State>
            <State label={t.states.loading}>
              <Button loading>{s.saving}</Button>
            </State>
          </States>
        </div>
      </Specimen>

      <Specimen title={t.names.field}>
        <States>
          <State label={t.states.default}>
            <TextInput label={s.fieldLabel} hint={s.fieldHint} />
          </State>
          <State label={t.states.focus}>
            <TextInput label={s.fieldLabel} hint={s.fieldHint} defaultValue={s.fieldValue} data-preview="focus" />
          </State>
          <State label={t.states.disabled}>
            <TextInput label={s.fieldLabel} hint={s.fieldHint} defaultValue={s.fieldValue} disabled />
          </State>
          <State label={t.states.error}>
            <TextInput label={s.fieldLabel} hint={s.fieldHint} defaultValue={s.fieldValue} error={s.fieldError} />
          </State>
        </States>
      </Specimen>

      <Specimen title={t.names.select}>
        <States>
          <State label={t.states.default}>
            <Select label={s.selectLabel} defaultValue="a">
              <option value="a">{s.selectA}</option>
              <option value="b">{s.selectB}</option>
            </Select>
          </State>
          <State label={t.states.disabled}>
            <Select label={s.selectLabel} defaultValue="a" disabled>
              <option value="a">{s.selectA}</option>
            </Select>
          </State>
        </States>
      </Specimen>

      <Specimen title={t.names.textarea}>
        <States wide>
          <State label={t.states.default}>
            <TextArea label={family.checkin.noteLabel} hint={family.checkin.noteHint} />
          </State>
          <State label={t.states.error}>
            <TextArea label={family.ask.label} error={family.ask.empty} />
          </State>
        </States>
      </Specimen>

      <Specimen title={t.names.chip}>
        <States>
          <State label={t.states.default}>
            <ToggleChip icon={Frown} label={family.checkin.symptoms.nausea} />
          </State>
          <State label={t.states.selected}>
            <ToggleChip icon={Frown} label={family.checkin.symptoms.nausea} defaultChecked />
          </State>
          <State label={t.states.focus}>
            <ToggleChip icon={Thermometer} label={family.checkin.symptoms.fever} preview="focus" />
          </State>
          <State label={t.states.disabled}>
            <ToggleChip icon={Thermometer} label={family.checkin.symptoms.fever} disabled />
          </State>
        </States>
        <ChipGroup legend={family.checkin.symptomsQuestion} hint={family.checkin.symptomsHint}>
          <ToggleChip icon={Frown} label={family.checkin.symptoms.nausea} defaultChecked />
          <ToggleChip icon={Thermometer} label={family.checkin.symptoms.fever} />
        </ChipGroup>
        <State label={t.names.staticChip}>
          <Chip icon={Thermometer}>{family.checkin.symptoms.fever}</Chip>
        </State>
      </Specimen>

      <Specimen title={t.names.radio}>
        <States wide>
          <State label={t.states.selected}>
            <RadioCardGroup
              legend={family.checkin.doseQuestion}
              name="specimen-dose"
              options={doseOptions}
              defaultValue="yes"
            />
          </State>
          <State label={t.states.disabled}>
            <RadioCardGroup
              legend={family.checkin.doseQuestion}
              name="specimen-dose-disabled"
              options={doseOptions}
              disabled
            />
          </State>
        </States>
      </Specimen>

      <Specimen title={t.names.alert}>
        <States wide>
          <Alert tone="info" title={s.alertInfo}>
            {s.alertBody}
          </Alert>
          <Alert tone="success" title={s.alertSuccess}>
            {s.alertBody}
          </Alert>
          <Alert tone="warning" title={s.alertWarning}>
            {s.alertBody}
          </Alert>
          <Alert tone="danger">{s.alertDanger}</Alert>
        </States>
      </Specimen>

      <Specimen title={t.names.triage}>
        <div className="flex flex-wrap gap-3">
          <TriageBadge level="GREEN" />
          <TriageBadge level="YELLOW" />
          <TriageBadge level="RED" />
        </div>
        <div className="flex flex-wrap gap-3">
          <TriageBadge level="GREEN" solid />
          <TriageBadge level="YELLOW" solid />
          <TriageBadge level="RED" solid />
        </div>
        <p className="text-base font-semibold text-ink">{t.names.triageBanner}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <TriageBadge level="GREEN" size="banner" />
          <TriageBadge level="YELLOW" size="banner" />
          <TriageBadge level="RED" size="banner" solid />
        </div>
      </Specimen>

      <Specimen title={t.names.status}>
        <div className="flex flex-wrap gap-3">
          <StatusPill tone="ok">{s.statusOk}</StatusPill>
          <StatusPill tone="warn">{s.statusWarn}</StatusPill>
          <StatusPill tone="off">{s.statusOff}</StatusPill>
          <StatusPill tone="danger">{s.statusDanger}</StatusPill>
          <StatusPill tone="info">{s.statusInfo}</StatusPill>
        </div>
      </Specimen>

      <Specimen title={t.names.steps}>
        <States wide>
          <StepIndicator label={family.consent.stepLabel} steps={family.consent.steps} current={0} />
          <StepIndicator label={s.stepLabel2} steps={family.consent.steps} current={1} />
        </States>
      </Specimen>

      <Specimen title={t.names.date}>
        <DateTile date={mockToday} />
      </Specimen>

      <Specimen title={t.names.header}>
        <PageHeader
          as="h4"
          title={s.headerTitle}
          subtitle={s.headerSubtitle}
          back={{ href: "#komponen", label: s.headerBack }}
          action={
            <ButtonLink size="md" variant="secondary" icon={UserPlus} href="#komponen">
              {s.emptyAction}
            </ButtonLink>
          }
        />
      </Specimen>

      <Specimen title={t.names.card}>
        <States wide>
          <Card className="flex flex-col gap-1">
            <h4 className="text-base font-semibold text-ink-muted">{s.cardTitle}</h4>
            <p className="text-xl font-bold text-ink">{s.cardBody}</p>
          </Card>
        </States>
      </Specimen>

      <Specimen title={t.names.empty}>
        <EmptyState
          icon={Users}
          title={s.emptyTitle}
          action={
            <ButtonLink block variant="secondary" icon={UserPlus} href="#komponen">
              {s.emptyAction}
            </ButtonLink>
          }
        >
          {s.emptyBody}
        </EmptyState>
      </Specimen>

      <Specimen title={t.names.bar}>
        <p className="text-base text-ink-muted">{s.barNote}</p>
        <div className="max-w-md overflow-hidden rounded-card border border-line bg-canvas px-4 pt-16">
          <BottomActionBar className="static">
            <Button block icon={Send}>
              {s.button}
            </Button>
          </BottomActionBar>
        </div>
      </Specimen>
    </div>
  );
}

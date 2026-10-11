// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Check, CircleDashed, Frown, Users, X } from "lucide-react";
import {
  Alert,
  BottomActionBar,
  Button,
  ButtonLink,
  Card,
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
  buttonClasses,
  formatLongDate,
} from "@/components/ui";

const dose = [
  { value: "yes", label: "Sudah", icon: Check },
  { value: "no", label: "Belum", icon: X },
  { value: "partial", label: "Sebagian", icon: CircleDashed },
] as const;

describe("Button", () => {
  it("is at least 48px high in every size and variant", () => {
    for (const variant of ["primary", "secondary", "danger", "quiet"] as const) {
      expect(buttonClasses({ variant, size: "lg" })).toMatch(/\bmin-h-14\b/);
      expect(buttonClasses({ variant, size: "md" })).toMatch(/\bmin-h-12\b/);
      expect(buttonClasses({ variant })).toMatch(/\bmin-w-12\b/);
    }
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Kirim</Button>);
    expect(screen.getByRole("button", { name: "Kirim" }).getAttribute("type")).toBe("button");
  });

  it("cannot be pressed when disabled and does not fade its text", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Kirim
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn.disabled).toBe(true);
    expect(btn.className).not.toMatch(/opacity/);
  });

  it("blocks repeat presses while loading and says it is busy", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Menyimpan...
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Menyimpan..." }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("ButtonLink renders a link with the button size", () => {
    render(<ButtonLink href="tel:0215550100">Telepon Puskesmas</ButtonLink>);
    const a = screen.getByRole("link", { name: "Telepon Puskesmas" });
    expect(a.getAttribute("href")).toBe("tel:0215550100");
    expect(a.className).toMatch(/\bmin-h-14\b/);
  });
});

describe("form fields", () => {
  it("wires label, hint and error to the input and announces the error", () => {
    render(<TextInput label="Kode pasien" hint="Jangan isi nama." error="Kode sudah dipakai" name="code" />);
    const input = screen.getByLabelText("Kode pasien");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toContain("Jangan isi nama.");
    expect(texts).toContain("Kode sudah dipakai");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Kode sudah dipakai");
    // The error is an icon and words, not colour alone.
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("has no describedby and is not invalid when there is no hint or error", () => {
    render(<TextInput label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.className).toMatch(/\bmin-h-14\b/);
  });

  it("labels a select and a text area the same way", () => {
    render(
      <>
        <Select label="Fase pengobatan" error="Fase pengobatan wajib dipilih">
          <option value="a">Intensif</option>
        </Select>
        <TextArea label="Catatan" hint="Jangan tulis nama atau alamat." />
      </>,
    );
    expect(screen.getByLabelText("Fase pengobatan").getAttribute("aria-invalid")).toBe("true");
    const area = screen.getByLabelText("Catatan");
    expect(document.getElementById(area.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Jangan tulis nama atau alamat.",
    );
  });
});

describe("symptom chips and big choices", () => {
  it("a chip is a labelled checkbox with an icon and a selected tick", () => {
    render(
      <ChipGroup legend="Ada keluhan hari ini?">
        <ToggleChip icon={Frown} label="Mual" />
      </ChipGroup>,
    );
    const box = screen.getByRole("checkbox", { name: "Mual" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    const label = box.closest("label")!;
    // Symptom icon plus the tick that replaces it when selected.
    expect(label.querySelectorAll("svg")).toHaveLength(2);
    expect(label.className).toMatch(/\bmin-h-12\b/);
    expect(screen.getByRole("group", { name: "Ada keluhan hari ini?" })).toBeTruthy();
  });

  it("chips in a group are spaced at least 8px apart", () => {
    const { container } = render(
      <ChipGroup legend="Keluhan">
        <ToggleChip icon={Frown} label="Mual" />
      </ChipGroup>,
    );
    // gap-3 is 12px in both directions.
    expect(container.querySelector(".flex-wrap")?.className).toMatch(/\bgap-3\b/);
  });

  it("the big choice is a radio group that reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <RadioCardGroup legend="Obat hari ini sudah diminum?" name="dose" options={dose} value={null} onChange={onChange} />,
    );
    expect(screen.getByRole("group", { name: "Obat hari ini sudah diminum?" })).toBeTruthy();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    fireEvent.click(screen.getByRole("radio", { name: "Belum" }));
    expect(onChange).toHaveBeenCalledWith("no");
  });

  it("an uncontrolled big choice keeps its own state", () => {
    render(<RadioCardGroup legend="Obat?" name="dose2" options={dose} defaultValue="yes" />);
    expect((screen.getByRole("radio", { name: "Sudah" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Sebagian" }));
    expect((screen.getByRole("radio", { name: "Sebagian" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("status is never colour alone", () => {
  const words = {
    GREEN: "Lanjutkan",
    YELLOW: "Perawat akan menghubungi",
    RED: "Segera ke Puskesmas",
  } as const;

  it.each(["GREEN", "YELLOW", "RED"] as const)("%s badge has an icon and its exact word", (level) => {
    const { container } = render(<TriageBadge level={level} />);
    expect(container.textContent).toBe(words[level]);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("each level uses a different icon shape", () => {
    const shapes = (["GREEN", "YELLOW", "RED"] as const).map((level) => {
      const { container } = render(<TriageBadge level={level} />);
      return container.querySelector("svg")!.innerHTML;
    });
    expect(new Set(shapes).size).toBe(3);
  });

  it("accepts the nurse console's short word", () => {
    const { container } = render(<TriageBadge level="RED" label="Merah" solid />);
    expect(container.textContent).toBe("Merah");
  });

  it("a status pill and an alert carry an icon beside their words", () => {
    const { container } = render(
      <>
        <StatusPill tone="warn">Belum setuju</StatusPill>
        <Alert tone="danger" role="alert" title="Gagal">
          Coba lagi.
        </Alert>
      </>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByRole("alert").textContent).toContain("Coba lagi.");
  });
});

describe("layout pieces", () => {
  it("render and expose their structure", () => {
    render(
      <>
        <PageHeader title="Daftar Pasien" subtitle="Status" back={{ href: "/nurse", label: "Kembali" }} />
        <StepIndicator label="Langkah 1 dari 2" steps={["Persetujuan", "Catatan harian"]} current={0} />
        <EmptyState icon={Users} title="Belum ada pasien" action={<ButtonLink href="/nurse/patients/new">Daftarkan</ButtonLink>}>
          Daftarkan pasien pertama.
        </EmptyState>
        <Card>Isi kartu</Card>
        <BottomActionBar>
          <Button>Kirim</Button>
        </BottomActionBar>
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Daftar Pasien" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kembali" }).className).toMatch(/\bmin-h-12\b/);
    expect(screen.getByRole("navigation", { name: "Langkah 1 dari 2" })).toBeTruthy();
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toBe("1. Persetujuan");
    expect(screen.getByRole("link", { name: "Daftarkan" }).getAttribute("href")).toBe("/nurse/patients/new");
    expect(screen.getByText("Isi kartu")).toBeTruthy();
  });

  it("the date tile reads as a full Indonesian date", () => {
    const { container } = render(<DateTile date="2026-10-12" />);
    const time = container.querySelector("time")!;
    expect(time.getAttribute("datetime")).toBe("2026-10-12");
    expect(time.getAttribute("aria-label")).toBe(formatLongDate("2026-10-12"));
    expect(formatLongDate("2026-10-12")).toMatch(/Senin.*12 Oktober 2026/);
    expect(time.textContent).toContain("12");
  });
});

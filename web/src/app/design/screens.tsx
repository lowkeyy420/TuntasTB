import type { ReactNode } from "react";
import { copy } from "@/copy/design.id";
import { AlertInboxMock } from "./mockups/AlertInboxMock";
import { AskMock } from "./mockups/AskMock";
import { CheckinMock } from "./mockups/CheckinMock";
import { PickupMock } from "./mockups/PickupMock";
import { QueueMock } from "./mockups/QueueMock";
import { ReplyView } from "./mockups/ReplyView";

export interface MockScreen {
  slug: string;
  area: "family" | "nurse";
  title: string;
  note: string;
  render: () => ReactNode;
}

const m = copy.mockups;

/** The screens not built yet, in review order. Each is served at /design/screens/<slug>. */
export const screens: MockScreen[] = [
  { slug: "checkin", area: "family", ...m.checkin, render: () => <CheckinMock /> },
  { slug: "reply-green", area: "family", ...m.replyGreen, render: () => <ReplyView level="GREEN" /> },
  { slug: "reply-yellow", area: "family", ...m.replyYellow, render: () => <ReplyView level="YELLOW" /> },
  { slug: "reply-red", area: "family", ...m.replyRed, render: () => <ReplyView level="RED" /> },
  { slug: "pickup", area: "family", ...m.pickup, render: () => <PickupMock /> },
  { slug: "ask", area: "family", ...m.ask, render: () => <AskMock /> },
  { slug: "queue", area: "nurse", ...m.queue, render: () => <QueueMock /> },
  { slug: "alerts", area: "nurse", ...m.alerts, render: () => <AlertInboxMock /> },
];

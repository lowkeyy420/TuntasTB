import {
  Bone,
  Brain,
  CircleDot,
  CircleQuestionMark,
  Droplet,
  Droplets,
  Eye,
  EyeOff,
  Frown,
  Hand,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * A stand-in picture for each symptom in the triage table. The chip's WORD
 * comes from the table (`label_id`); the picture is only a hint. A symptom
 * added to the table later still gets a chip (with a neutral icon) with no
 * change here. Real pictograms should be tested with families.
 */
const BY_CODE: Record<string, LucideIcon> = {
  urine_orange: Droplet,
  nausea_mild: Frown,
  joint_ache_mild: Bone,
  appetite_loss: UtensilsCrossed,
  tingling_feet: Zap,
  itching_no_rash: Hand,
  jaundice: Eye,
  vision_change: EyeOff,
  skin_rash: CircleDot,
  vomiting_repeated: Droplets,
  confusion: Brain,
};

export function symptomIcon(code: string): LucideIcon {
  return BY_CODE[code] ?? CircleQuestionMark;
}

import { Icon } from "./icon";

const TONES: Record<string, string> = { gold: "#e8b84a", ember: "#e8825a", sky: "#6fa4ea", jade: "#4fc3a1", violet: "#9a8cf0", rose: "#e07a9b" };

export function Avatar({ avatar, size = 40 }: { avatar: { icon: string; tone: string }; size?: number }) {
  const c = TONES[avatar.tone] ?? TONES.gold;
  return (
    <span className="grid shrink-0 place-items-center rounded-full border" style={{ width: size, height: size, background: `color-mix(in oklab, ${c} 16%, var(--surface-2))`, borderColor: `color-mix(in oklab, ${c} 55%, var(--line))`, color: c }} aria-hidden>
      <Icon name={avatar.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
export const AVATAR_TONE_COLORS = TONES;

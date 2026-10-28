import type { Person } from "../types";

interface Props {
  person: Person;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  onClick?: () => void;
  showName?: boolean;
}

// A family member's initial in a paper circle. Pets get a dotted outer ring.
export default function Face({ person, size = "md", active, onClick, showName }: Props) {
  const cls = `face face-${size}${active ? " is-active" : ""}${person.kind === "pet" ? " is-pet" : ""}`;
  const inner = (
    <>
      <span className={cls} aria-hidden="true">{person.initial}</span>
      {showName && <span className="face-name">{person.name}</span>}
    </>
  );
  if (!onClick) return <span className="face-wrap" title={person.name}>{inner}</span>;
  return (
    <button type="button" className="face-wrap face-button" onClick={onClick} aria-pressed={active} aria-label={person.name}>
      {inner}
    </button>
  );
}

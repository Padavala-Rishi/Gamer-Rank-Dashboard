"use client";
import { Icon } from "./icon";
import type { QuickAddDefaults } from "./task-form";
import { useUI } from "./ui-context";

/** Opens the quick-add sheet pre-filled (date, area, etc.). */
export function AddQuestButton({ defaults, label = "Add quest", className = "btn btn-sm", icon = true }: { defaults?: QuickAddDefaults; label?: string; className?: string; icon?: boolean }) {
  const { openQuickAdd } = useUI();
  return (
    <button type="button" className={className} onClick={() => openQuickAdd(defaults)}>
      {icon && <Icon name="plus" size={14} />}{label}
    </button>
  );
}

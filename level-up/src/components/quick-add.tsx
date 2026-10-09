"use client";
import { Sheet } from "./sheet";
import { TaskForm, type QuickAddDefaults } from "./task-form";

export function QuickAdd({ open, defaults, today, onClose }: { open: boolean; defaults?: QuickAddDefaults; today: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New quest">
      {open && <TaskForm today={today} defaults={defaults} onDone={onClose} />}
    </Sheet>
  );
}

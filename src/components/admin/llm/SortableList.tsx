'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  };
  return (
    <li ref={setNodeRef} style={style} className="touch-manipulation">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <button
          type="button"
          aria-label="Drag untuk ubah urutan"
          className="cursor-grab rounded p-1 text-ink-muted hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </li>
  );
}

export function SortableList({
  items,
  onReorder,
  onSettled,
  renderItem
}: {
  items: { id: string }[];
  /** Simpan urutan baru. Throw/return false bila gagal → list dikembalikan + onSettled(false). */
  onReorder: (orderedIds: string[]) => Promise<boolean | void> | boolean | void;
  /** Dipanggil setelah simpan selesai (sukses/gagal) untuk notice + busy state. */
  onSettled?: (ok: boolean, error?: string) => void;
  renderItem: (itemId: string) => React.ReactNode;
}) {
  const [ids, setIds] = useState(() => items.map((i) => i.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (ids.length !== items.length || ids.some((id, i) => id !== items[i]!.id)) {
    setTimeout(() => setIds(items.map((i) => i.id)), 0);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const prev = ids;
    const next = arrayMove(ids, oldIndex, newIndex);
    setIds(next);
    try {
      const r = await onReorder(next);
      if (r === false) throw new Error('Gagal menyimpan urutan.');
      onSettled?.(true);
    } catch (e) {
      // Rollback optimistik + laporkan agar board tampilkan notice error.
      setIds(prev);
      onSettled?.(false, e instanceof Error ? e.message : 'Gagal menyimpan urutan.');
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="Daftar urutan — drag untuk ubah">
          {ids.map((id) => (
            <SortableItem key={id} id={id}>
              {renderItem(id)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="rounded-lg border border-primary bg-surface p-2 opacity-90 shadow-card" aria-hidden>
            {renderItem(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

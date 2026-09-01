// Generic add/remove list wrapper — used for directors and repeatable
// state-regulator/permit entries. Presentational only; the parent step owns
// the actual array state (typically via react-hook-form's useFieldArray).

interface RepeatableFieldListProps<T> {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel: string;
  minItems?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
}

export default function RepeatableFieldList<T>({ items, onAdd, onRemove, addLabel, minItems = 0, renderItem, getKey }: RepeatableFieldListProps<T>) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={getKey(item, i)} className="relative bg-[var(--muted)] rounded-lg p-4 border border-[var(--border)]">
          {items.length > minItems && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-3 right-3 text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
          {renderItem(item, i)}
        </div>
      ))}
      <button type="button" onClick={onAdd} className="text-sm font-medium text-[var(--accent)] hover:underline">
        + {addLabel}
      </button>
    </div>
  );
}

import { useEffect, useId, type ReactElement } from 'react';

export function NewPlaylistModal(props: {
  readonly open: boolean;
  readonly title: string;
  readonly confirmLabel: string;
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement | null {
  const titleId = useId();
  const { open, title, confirmLabel, name, onNameChange, onConfirm, onCancel } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <label className="modal-label">
          Playlist name
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              onNameChange(e.target.value);
            }}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={() => { onConfirm(); }}>
            {confirmLabel}
          </button>
          <button type="button" className="ghost" onClick={() => { onCancel(); }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

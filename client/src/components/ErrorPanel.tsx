interface ErrorPanelProps {
  message?: string;
  onDismiss?: () => void;
}

export function ErrorPanel({ message, onDismiss }: ErrorPanelProps) {
  if (!message) return null;
  return (
    <div className="error-panel" role="alert">
      <span>⚠ {message}</span>
      {onDismiss && (
        <button type="button" className="error-panel__close" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}

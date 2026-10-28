export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <p className="kicker">Empty</p>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

export function ErrorNote({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <p>{text}</p>
      {onRetry && (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="skeletons" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="skel" key={index} />
      ))}
    </div>
  );
}

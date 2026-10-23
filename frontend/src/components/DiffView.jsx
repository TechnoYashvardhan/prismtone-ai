/** Renders word-level diff tokens: deletions struck through in red, additions in green. */
export default function DiffView({ tokens = [] }) {
  if (!tokens.length) return <span className="subtle">No differences.</span>;
  return (
    <span>
      {tokens.map((chunk, idx) => (
        <span key={idx} className={`diff-${chunk.type}`}>{chunk.text}</span>
      ))}
    </span>
  );
}

export function DiffLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'rgba(239,68,68,0.5)' }} />Removed</span>
      <span><i style={{ background: 'rgba(16,185,129,0.6)' }} />Added</span>
      <span><i style={{ background: '#475569' }} />Unchanged</span>
    </div>
  );
}

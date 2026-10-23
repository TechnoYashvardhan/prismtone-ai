import {
  AlertTriangle, Check, Copy, Eye, GitCompareArrows, RotateCcw, ShieldCheck, Square, Volume2,
} from 'lucide-react';
import DiffView from './DiffView';

const GUARD_LABEL = { green: 'Facts Preserved', amber: 'Check Facts', red: 'Fact Alert' };

/** One persona output card: rewrite, diff toggle, Fact Guard audit, notes, risks and metrics. */
export default function PersonaCard({
  item,
  color,
  viewMode,
  factsOpen,
  busy,
  copied,
  speaking,
  canSpeak,
  onViewMode,
  onToggleFacts,
  onCopy,
  onSpeak,
  onRegenerate,
}) {
  const isDiff = viewMode === 'diff';
  const m = item.metrics;

  return (
    <article className={`card ${busy ? 'is-busy' : ''}`} style={{ '--persona-color': color }} aria-busy={busy}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2>{item.persona_name}</h2>
            <p className="tiny muted" style={{ marginTop: 2 }}>{item.tagline}</p>
          </div>
          <button
            type="button"
            className={`badge badge-${item.fact_guard_status}`}
            onClick={onToggleFacts}
            aria-expanded={factsOpen}
            title="Fact Guard: checks that dates, numbers, names and commitments survived"
          >
            <ShieldCheck size={12} /> {GUARD_LABEL[item.fact_guard_status]}
          </button>
        </div>

        {factsOpen && (
          <div className="inset" style={{ padding: '8px 10px' }}>
            <div className="tiny muted" style={{ fontWeight: 700, marginBottom: 4 }}>Fact Guard Audit</div>
            {item.facts_found.length === 0 && <div className="tiny subtle">No hard facts (dates, numbers, names) detected in the draft.</div>}
            {item.facts_found.map((f, idx) => (
              <div key={idx} className="fact-row" title={f.explanation || ''}>
                <span><code>{f.text}</code> <span className="subtle">({f.category})</span></span>
                <span className={`fact-${f.status}`}>{f.status}</span>
              </div>
            ))}
          </div>
        )}

        {item.subject_line && (
          <div className="subject-line"><strong className="muted">Subject:</strong> {item.subject_line}</div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <div className="segmented" role="group" aria-label="View mode">
            <button type="button" aria-pressed={!isDiff} onClick={() => onViewMode('clean')}><Eye size={11} /> Clean</button>
            <button type="button" aria-pressed={isDiff} onClick={() => onViewMode('diff')}><GitCompareArrows size={11} /> Word Diff</button>
          </div>
        </div>

        <div className="card-text">{isDiff ? <DiffView tokens={item.diff_tokens} /> : item.rewrite}</div>

        {item.change_notes?.length > 0 && (
          <div>
            <span className="small muted" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Why this changed</span>
            <ul className="notes">{item.change_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}

        {item.risk_flags?.length > 0 && (
          <div className="risk"><AlertTriangle size={14} style={{ flexShrink: 0 }} /><span><strong>Risk note:</strong> {item.risk_flags.join(' • ')}</span></div>
        )}

        <div className="inset" style={{ padding: '10px 12px' }}>
          <div className="row-between tiny" style={{ marginBottom: 6 }}>
            <span>Change Score</span>
            <strong className="mono" style={{ color: '#818cf8' }}>{m.change_score} / 100</strong>
          </div>
          <div className="score-bar" style={{ marginBottom: 8 }}><div style={{ width: `${m.change_score}%` }} /></div>
          <div className="metric-grid">
            <div className="metric-cell"><span>Formality</span><strong>{m.formality}</strong></div>
            <div className="metric-cell"><span>Warmth</span><strong>{m.warmth}</strong></div>
            <div className="metric-cell"><span>Directness</span><strong>{m.directness}</strong></div>
          </div>
          <div className="row-between tiny subtle" style={{ marginTop: 8 }}>
            <span>{m.word_count} words ({m.length_change_pct >= 0 ? '+' : ''}{m.length_change_pct}%)</span>
            <span>{m.reading_level_label}</span>
          </div>
        </div>
      </div>

      <div className="card-actions">
        <div className="row" style={{ gap: 6 }}>
          {canSpeak && (
            <button type="button" className={`btn ${speaking ? 'btn-on' : ''}`} onClick={onSpeak} title="Read aloud in this persona's voice style">
              {speaking ? <Square size={12} /> : <Volume2 size={13} />} {speaking ? 'Stop' : 'Listen'}
            </button>
          )}
          <button type="button" className="btn" onClick={onRegenerate} disabled={busy} title="Generate a fresh variation of this persona">
            <RotateCcw size={13} className={busy ? 'animate-spin' : ''} /> Retry
          </button>
        </div>
        <button type="button" className={`btn ${copied ? 'btn-success' : 'btn-solid'}`} onClick={onCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </article>
  );
}

export function PersonaCardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="skeleton" style={{ height: 20, width: '55%' }} />
      <div className="skeleton" style={{ height: 12, width: '80%' }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 60 }} />
    </div>
  );
}

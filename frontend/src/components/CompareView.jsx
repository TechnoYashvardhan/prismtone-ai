import React, { useState, useEffect } from 'react';
import { GitCompareArrows, RefreshCw, Copy, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import DiffView, { DiffLegend } from './DiffView';
import { api } from '../lib/api';
import { copyText } from '../lib/export';
import { personaColor } from '../lib/personas';
import { RADAR_AXES } from '../constants';

export default function CompareView({ result, registry, onToast }) {
  if (!result || !result.results) return null;
  const cards = Object.values(result.results);
  if (cards.length < 2) {
    return <div className="empty-state">Need at least 2 personas generated to compare.</div>;
  }

  const [leftId, setLeftId] = useState(cards[0]?.persona_id || 'executive');
  const [rightId, setRightId] = useState(cards[1]?.persona_id || 'gen_z');
  const [diffTokens, setDiffTokens] = useState([]);
  const [changeScore, setChangeScore] = useState(0);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [copiedSide, setCopiedSide] = useState(null);

  const leftCard = result.results[leftId] || cards[0];
  const rightCard = result.results[rightId] || cards[1];

  useEffect(() => {
    let active = true;
    async function fetchCrossDiff() {
      if (!leftCard || !rightCard) return;
      if (leftCard.persona_id === rightCard.persona_id) {
        setDiffTokens([{ type: 'unchanged', text: leftCard.rewrite }]);
        setChangeScore(0);
        return;
      }
      setLoadingDiff(true);
      try {
        const resp = await api.diff(leftCard.rewrite, rightCard.rewrite);
        if (active) {
          setDiffTokens(resp.diff_tokens);
          setChangeScore(resp.change_score);
        }
      } catch (err) {
        console.warn("Cross-diff fetch failed", err);
      } finally {
        if (active) setLoadingDiff(false);
      }
    }
    fetchCrossDiff();
    return () => { active = false; };
  }, [leftCard, rightCard]);

  const handleCopy = async (text, side) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedSide(side);
      onToast?.('Copied to clipboard!', 'success');
      setTimeout(() => setCopiedSide(null), 2000);
    }
  };

  return (
    <div className="stack">
      {/* Selector Header */}
      <div className="panel">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="panel-title">
            <GitCompareArrows size={18} color="#818cf8" /> Dual Persona Cross-Inspector
          </h3>
          <span className="tiny subtle">Compare how two voices package the same facts</span>
        </div>

        <div className="row-between" style={{ gap: 16 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="field-label">Persona A (Baseline)</label>
            <select
              className="input"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              style={{ borderLeft: `4px solid ${personaColor(registry, leftId)}` }}
            >
              {cards.map(c => (
                <option key={c.persona_id} value={c.persona_id}>{c.persona_name}</option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
            <ArrowRight size={20} className="subtle" />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="field-label">Persona B (Comparison)</label>
            <select
              className="input"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              style={{ borderLeft: `4px solid ${personaColor(registry, rightId)}` }}
            >
              {cards.map(c => (
                <option key={c.persona_id} value={c.persona_id}>{c.persona_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Side-by-Side Outputs */}
      <div className="grid-2">
        {/* Left Side */}
        <div className="card" style={{ '--persona-color': personaColor(registry, leftCard.persona_id) }}>
          <div className="row-between">
            <div>
              <h2>{leftCard.persona_name}</h2>
              <span className="tiny muted">{leftCard.tagline}</span>
            </div>
            <span className={`badge badge-${leftCard.fact_guard_status}`}>
              <ShieldCheck size={12} /> {leftCard.fact_guard_status}
            </span>
          </div>
          {leftCard.subject_line && (
            <div className="subject-line"><strong>Subject:</strong> {leftCard.subject_line}</div>
          )}
          <div className="card-text">{leftCard.rewrite}</div>
          <div className="row-between tiny subtle" style={{ marginTop: 8 }}>
            <span>{leftCard.metrics.word_count} words</span>
            <span>{leftCard.metrics.reading_level_label}</span>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className={`btn ${copiedSide === 'left' ? 'btn-success' : 'btn-solid'}`}
              onClick={() => handleCopy(leftCard.rewrite, 'left')}
            >
              {copiedSide === 'left' ? <Check size={13} /> : <Copy size={13} />}
              {copiedSide === 'left' ? 'Copied!' : 'Copy Polish'}
            </button>
          </div>
        </div>

        {/* Right Side */}
        <div className="card" style={{ '--persona-color': personaColor(registry, rightCard.persona_id) }}>
          <div className="row-between">
            <div>
              <h2>{rightCard.persona_name}</h2>
              <span className="tiny muted">{rightCard.tagline}</span>
            </div>
            <span className={`badge badge-${rightCard.fact_guard_status}`}>
              <ShieldCheck size={12} /> {rightCard.fact_guard_status}
            </span>
          </div>
          {rightCard.subject_line && (
            <div className="subject-line"><strong>Subject:</strong> {rightCard.subject_line}</div>
          )}
          <div className="card-text">{rightCard.rewrite}</div>
          <div className="row-between tiny subtle" style={{ marginTop: 8 }}>
            <span>{rightCard.metrics.word_count} words</span>
            <span>{rightCard.metrics.reading_level_label}</span>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className={`btn ${copiedSide === 'right' ? 'btn-success' : 'btn-solid'}`}
              onClick={() => handleCopy(rightCard.rewrite, 'right')}
            >
              {copiedSide === 'right' ? <Check size={13} /> : <Copy size={13} />}
              {copiedSide === 'right' ? 'Copied!' : 'Copy Polish'}
            </button>
          </div>
        </div>
      </div>

      {/* Cross-Diff Inspector */}
      <div className="panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h4 className="panel-title">
              Direct Lexical Cross-Diff ({leftCard.persona_name} → {rightCard.persona_name})
            </h4>
            <p className="tiny subtle" style={{ marginTop: 2 }}>
              Red strikethrough = terms dropped by {rightCard.persona_name} • Green = introduced by {rightCard.persona_name}
            </p>
          </div>
          <span className="badge badge-accent mono">
            {changeScore.toFixed(0)}% Voice Divergence
          </span>
        </div>

        <div className="card-text" style={{ minHeight: 90 }}>
          {loadingDiff ? (
            <div className="row" style={{ gap: 8, color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="animate-spin" /> Computing cross-persona diff...
            </div>
          ) : (
            <DiffView tokens={diffTokens} />
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <DiffLegend />
        </div>
      </div>

      {/* Metric Delta Comparison Table */}
      <div className="panel">
        <h4 className="panel-title" style={{ marginBottom: 12 }}>Metric Delta Comparison</h4>
        <div className="inset" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 14px' }}>Dimension</th>
                <th style={{ padding: '10px 14px' }}>{leftCard.persona_name}</th>
                <th style={{ padding: '10px 14px' }}>{rightCard.persona_name}</th>
                <th style={{ padding: '10px 14px' }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {RADAR_AXES.map(axis => {
                const valA = leftCard.metrics[axis.key] || 0;
                const valB = rightCard.metrics[axis.key] || 0;
                const delta = (valB - valA).toFixed(1);
                const sign = delta > 0 ? `+${delta}` : delta;
                return (
                  <tr key={axis.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{axis.label}</td>
                    <td style={{ padding: '8px 14px' }} className="mono">{valA.toFixed(1)}</td>
                    <td style={{ padding: '8px 14px' }} className="mono">{valB.toFixed(1)}</td>
                    <td style={{ padding: '8px 14px' }} className="mono">
                      <span style={{
                        color: delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : 'var(--text-subtle)',
                        fontWeight: 700
                      }}>
                        {sign}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding: '8px 14px', fontWeight: 600 }}>Word Count</td>
                <td style={{ padding: '8px 14px' }} className="mono">{leftCard.metrics.word_count}</td>
                <td style={{ padding: '8px 14px' }} className="mono">{rightCard.metrics.word_count}</td>
                <td style={{ padding: '8px 14px' }} className="mono">
                  {rightCard.metrics.word_count - leftCard.metrics.word_count >= 0 ? '+' : ''}
                  {rightCard.metrics.word_count - leftCard.metrics.word_count}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { GitCompareArrows, RefreshCw, Copy, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import DiffView, { DiffLegend } from './DiffView';
import { api } from '../lib/api';
import { copyText } from '../lib/export';
import { personaColor } from '../lib/personas';
import { RADAR_AXES } from '../constants';

export default function CompareView({ result, registry, onToast }) {
  const cards = result?.results ? Object.values(result.results) : [];

  const [leftId, setLeftId] = useState(() => cards[0]?.persona_id || 'executive');
  const [rightId, setRightId] = useState(() => cards[1]?.persona_id || 'gen_z');
  const [diffTokens, setDiffTokens] = useState([]);
  const [changeScore, setChangeScore] = useState(0);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [copiedSide, setCopiedSide] = useState(null);

  // Keep selected persona IDs valid whenever result personas change
  useEffect(() => {
    if (cards.length < 2) return;
    const validIds = cards.map((c) => c.persona_id);
    if (!validIds.includes(leftId)) {
      setLeftId(validIds[0]);
    }
    if (!validIds.includes(rightId) || rightId === leftId) {
      const fallbackRight = validIds.find((id) => id !== (validIds.includes(leftId) ? leftId : validIds[0])) || validIds[1];
      if (fallbackRight && !validIds.includes(rightId)) {
        setRightId(fallbackRight);
      }
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const leftCard = result?.results?.[leftId] || cards[0] || null;
  const rightCard = result?.results?.[rightId] || cards[1] || null;

  useEffect(() => {
    let active = true;
    async function fetchCrossDiff() {
      if (!leftCard || !rightCard || cards.length < 2) return;
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
        console.warn('Cross-diff fetch failed', err);
      } finally {
        if (active) setLoadingDiff(false);
      }
    }
    fetchCrossDiff();
    return () => { active = false; };
  }, [leftCard?.persona_id, leftCard?.rewrite, rightCard?.persona_id, rightCard?.rewrite, cards.length]);

  if (!result || !result.results) return null;
  if (cards.length < 2) {
    return (
      <div className="empty-state">
        Select at least 2 target personas in the Studio Workspace to run a side-by-side Cross-Diff comparison.
      </div>
    );
  }

  const handleCopy = async (text, side) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedSide(side);
      onToast?.('Copied to clipboard!', 'success');
      setTimeout(() => setCopiedSide(null), 2000);
    }
  };

  const leftColor = personaColor(registry, leftCard.persona_id);
  const rightColor = personaColor(registry, rightCard.persona_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Anti-Card Top Selector Rail */}
      <div
        style={{
          padding: '20px 28px',
          background: 'var(--stage-header-bg)',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div className="row-between" style={{ flexWrap: 'wrap' }}>
          <h3 className="panel-title">
            <GitCompareArrows size={18} color="var(--accent-light)" />
            <span>Dual Persona Cross-Inspector</span>
          </h3>
          <span className="tiny subtle">Compare how two distinct voices package the exact same facts</span>
        </div>

        <div className="row-between" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="subtle" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Persona A (Baseline Voice)
            </label>
            <select
              className="control-select"
              value={leftCard.persona_id}
              onChange={(e) => setLeftId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderLeft: `4px solid ${leftColor}` }}
            >
              {cards.map((c) => (
                <option key={c.persona_id} value={c.persona_id}>{c.persona_name}</option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
            <ArrowRight size={18} className="subtle" />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="subtle" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Persona B (Comparison Voice)
            </label>
            <select
              className="control-select"
              value={rightCard.persona_id}
              onChange={(e) => setRightId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderLeft: `4px solid ${rightColor}` }}
            >
              {cards.map((c) => (
                <option key={c.persona_id} value={c.persona_id}>{c.persona_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Anti-Card Split Stream Columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          borderBottom: '1px solid var(--border-hairline)'
        }}
      >
        {[
          { card: leftCard, color: leftColor, side: 'left' },
          { card: rightCard, color: rightColor, side: 'right' }
        ].map(({ card, color, side }, idx) => (
          <section
            key={side}
            style={{
              padding: '26px 28px',
              borderRight: idx === 0 ? '1px solid var(--border-hairline)' : 'none',
              borderTop: `3px solid ${color}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            <div className="row-between">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color }}>{card.persona_name}</h2>
                <span className="tiny subtle">{card.tagline}</span>
              </div>
              <span className={`fact-guard-badge ${card.fact_guard_status}`} style={{ cursor: 'default' }}>
                <ShieldCheck size={13} />
                <span>{card.fact_guard_status}</span>
              </span>
            </div>

            {card.subject_line && (
              <div className="subject-banner" style={{ '--active-persona-color': color }}>
                <span>Subject:</span>
                <strong>{card.subject_line}</strong>
              </div>
            )}

            <div
              style={{
                flex: 1,
                fontSize: 15,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)',
                padding: '6px 0'
              }}
            >
              {card.rewrite}
            </div>

            <div
              className="row-between"
              style={{
                paddingTop: 12,
                borderTop: '1px solid var(--border-hairline)',
                fontSize: 12
              }}
            >
              <span className="subtle">
                {card.metrics.word_count} words • {card.metrics.reading_level_label}
              </span>
              <button
                type="button"
                className={`stage-btn ${copiedSide === side ? 'copied' : ''}`}
                onClick={() => handleCopy(card.rewrite, side)}
              >
                {copiedSide === side ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedSide === side ? 'Copied!' : 'Copy Rewrite'}</span>
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* Direct Lexical Cross-Diff Section */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="row-between" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h4 className="panel-title">
              Direct Lexical Cross-Diff ({leftCard.persona_name} → {rightCard.persona_name})
            </h4>
            <p className="tiny subtle" style={{ marginTop: 2 }}>
              Red strikethrough = dropped from {leftCard.persona_name} • Green underline = added by {rightCard.persona_name}
            </p>
          </div>
          <span
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 999,
              background: 'var(--accent-surface)',
              color: 'var(--accent)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            {changeScore.toFixed(0)}% Voice Divergence
          </span>
        </div>

        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 10,
            padding: '16px 18px',
            minHeight: 80,
            fontSize: 15,
            lineHeight: 1.75
          }}
        >
          {loadingDiff ? (
            <div className="row-center muted" style={{ fontSize: 13 }}>
              <RefreshCw size={14} className="animate-spin" />
              <span>Computing cross-persona word diff...</span>
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
      <div style={{ padding: '24px 28px' }}>
        <h4 className="panel-title" style={{ marginBottom: 12 }}>Metric Delta Matrix</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                <th style={{ padding: '10px 14px' }}>Dimension</th>
                <th style={{ padding: '10px 14px' }}>{leftCard.persona_name}</th>
                <th style={{ padding: '10px 14px' }}>{rightCard.persona_name}</th>
                <th style={{ padding: '10px 14px' }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {RADAR_AXES.map((axis) => {
                const valA = leftCard.metrics[axis.key] || 0;
                const valB = rightCard.metrics[axis.key] || 0;
                const rawDelta = valB - valA;
                const delta = rawDelta.toFixed(1);
                const sign = rawDelta > 0 ? `+${delta}` : delta;
                return (
                  <tr key={axis.key} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{axis.label}</td>
                    <td style={{ padding: '9px 14px' }} className="mono">{valA.toFixed(1)}</td>
                    <td style={{ padding: '9px 14px' }} className="mono">{valB.toFixed(1)}</td>
                    <td style={{ padding: '9px 14px' }} className="mono">
                      <span
                        style={{
                          color: rawDelta > 0 ? 'var(--success)' : rawDelta < 0 ? 'var(--danger)' : 'var(--text-tertiary)',
                          fontWeight: 700
                        }}
                      >
                        {sign}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding: '9px 14px', fontWeight: 600 }}>Word Count</td>
                <td style={{ padding: '9px 14px' }} className="mono">{leftCard.metrics.word_count}</td>
                <td style={{ padding: '9px 14px' }} className="mono">{rightCard.metrics.word_count}</td>
                <td style={{ padding: '9px 14px' }} className="mono">
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

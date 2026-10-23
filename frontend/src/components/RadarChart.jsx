import { useState } from 'react';
import { RADAR_AXES } from '../constants';

const SIZE = 340;
const CENTER = SIZE / 2;
const RADIUS = 120;
const RINGS = [2, 4, 6, 8, 10];

function point(axisIndex, value, total) {
  const angle = (Math.PI * 2 * axisIndex) / total - Math.PI / 2;
  const r = (Math.max(0, Math.min(10, value)) / 10) * RADIUS;
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
}

/**
 * Multi-polygon SVG radar chart (no chart library).
 * series: [{ id, label, color, values: { formality, warmth, ... }, dashed? }]
 */
export default function RadarChart({ series }) {
  const [focusId, setFocusId] = useState(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [hoverAxis, setHoverAxis] = useState(null);
  const total = RADAR_AXES.length;

  const visible = series.filter((s) => !hiddenIds.includes(s.id));
  const toggleHidden = (id) => setHiddenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="radar-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Tone radar chart comparing personas">
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={RADAR_AXES.map((_, i) => point(i, ring, total).join(',')).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
          />
        ))}
        {RADAR_AXES.map((axis, i) => {
          const [x, y] = point(i, 10, total);
          const [lx, ly] = point(i, 11.8, total);
          const active = hoverAxis === axis.key;
          return (
            <g key={axis.key} onMouseEnter={() => setHoverAxis(axis.key)} onMouseLeave={() => setHoverAxis(null)} style={{ cursor: 'help' }}>
              <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={active ? 'rgba(165,180,252,0.6)' : 'rgba(255,255,255,0.1)'} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill={active ? '#c7d2fe' : '#94a3b8'}>
                {axis.label}
              </text>
            </g>
          );
        })}
        {visible.map((s) => {
          const pts = RADAR_AXES.map((axis, i) => point(i, s.values[axis.key] ?? 0, total));
          const dimmed = focusId && focusId !== s.id;
          return (
            <g key={s.id} style={{ transition: 'opacity 0.2s' }} opacity={dimmed ? 0.15 : 1}>
              <polygon
                points={pts.map((p) => p.join(',')).join(' ')}
                fill={s.color}
                fillOpacity={s.dashed ? 0 : 0.12}
                stroke={s.color}
                strokeWidth={focusId === s.id ? 2.5 : 1.6}
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
              {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} fill={s.color} />)}
            </g>
          );
        })}
      </svg>

      <div className="radar-legend">
        {series.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`${focusId === s.id ? 'active' : ''} ${hiddenIds.includes(s.id) ? 'dimmed' : ''}`}
            onMouseEnter={() => setFocusId(s.id)}
            onMouseLeave={() => setFocusId(null)}
            onClick={() => toggleHidden(s.id)}
            title="Hover to focus • click to show/hide"
          >
            <span className="swatch" style={{ background: s.dashed ? 'transparent' : s.color, border: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }} />
            {s.label}
          </button>
        ))}
        <div className="tiny subtle" style={{ marginTop: 6, minHeight: 64 }}>
          {hoverAxis ? (
            <>
              <strong className="muted">{RADAR_AXES.find((a) => a.key === hoverAxis).label}</strong>
              {visible.map((s) => (
                <div key={s.id} className="row-between"><span>{s.label}</span><span className="mono">{(s.values[hoverAxis] ?? 0).toFixed(1)}</span></div>
              ))}
            </>
          ) : 'Hover an axis label to compare exact scores (1–10).'}
        </div>
      </div>
    </div>
  );
}

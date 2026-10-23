import { Activity, Radar } from 'lucide-react';
import RadarChart from './RadarChart';
import { ORIGINAL_COLOR, RADAR_AXES } from '../constants';
import { personaColor } from '../lib/personas';

const SHIFT_AXES = RADAR_AXES.filter((a) => a.key !== 'readability');
const pct = (v) => `${((Math.max(1, Math.min(10, v)) - 1) / 9) * 100}%`;

/**
 * Step 1: Tone visualizations.
 * - Radar chart: original vs every persona (+ slider target when sliders are on)
 * - Tone shift spectrum: where the draft started and where each persona moved it
 */
export default function InsightsPanel({ result, registry, target }) {
  if (!result) return null;
  const cards = Object.values(result.results);
  const original = result.original_metrics;

  const series = [
    { id: '__original', label: 'Original draft', color: ORIGINAL_COLOR, values: original, dashed: true },
    ...cards.map((c) => ({ id: c.persona_id, label: c.persona_name, color: personaColor(registry, c.persona_id), values: c.metrics })),
  ];
  if (target) series.push({ id: '__target', label: 'Slider target', color: '#a5b4fc', values: target, dashed: true });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <RadarChart series={series} />
      </section>

      <section style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 20 }}>
        <h4 className="panel-title" style={{ marginBottom: 4 }}>
          <Activity size={16} color="var(--accent-light)" />
          <span>Tone Shift Spectrum</span>
        </h4>
        <p className="tiny subtle" style={{ marginBottom: 16 }}>
          Vertical bar = your original draft • Colored dots = where each persona moved it (1–10).
        </p>
        {SHIFT_AXES.map((axis) => (
          <div key={axis.key} className="shift-row">
            <span className="muted" style={{ fontWeight: 600 }}>{axis.label}</span>
            <div>
              <div className="shift-track">
                <div className="shift-dot original" style={{ left: pct(original[axis.key]) }} title={`Original: ${original[axis.key]}`} />
                {cards.map((c) => (
                  <div
                    key={c.persona_id}
                    className="shift-dot"
                    style={{ left: pct(c.metrics[axis.key]), background: personaColor(registry, c.persona_id) }}
                    title={`${c.persona_name}: ${c.metrics[axis.key]} (${c.metrics[axis.key] - original[axis.key] >= 0 ? '+' : ''}${(c.metrics[axis.key] - original[axis.key]).toFixed(1)})`}
                  />
                ))}
              </div>
              <div className="shift-scale"><span>1</span><span>5</span><span>10</span></div>
            </div>
          </div>
        ))}
        <div className="row tiny" style={{ marginTop: 6, gap: 12 }}>
          {cards.map((c) => (
            <span key={c.persona_id} className="row-center" style={{ gap: 6 }}>
              <span className="swatch" style={{ background: personaColor(registry, c.persona_id), borderRadius: '50%' }} />
              <span>{c.persona_name}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

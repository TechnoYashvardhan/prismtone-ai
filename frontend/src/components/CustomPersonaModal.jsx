import React, { useState } from 'react';
import { Plus, X, Trash2, Sparkles, UserCheck } from 'lucide-react';
import { slugifyPersonaId } from '../lib/personas';

const COLLEGE_TEMPLATES = [
  {
    name: 'Professor Email',
    description: 'Polite, deferential, academic etiquette. Preserves deadlines, states reason respectfully, and includes polite closing.'
  },
  {
    name: 'Placement HR Follow-up',
    description: 'Professional, confident campus placement drive query. Respectful of recruitment timelines while requesting status.'
  },
  {
    name: 'Investor Update',
    description: 'Crisp, metrics-driven, highlights growth, risks, and next quarterly milestones without technical jargon.'
  },
  {
    name: 'Customer Apology',
    description: 'Empathetic, accountable, zero excuses, offering immediate remediation and goodwill credit.'
  }
];

export default function CustomPersonaModal({ isOpen, onClose, customPersonas, onSave, onDelete, onToast }) {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleApplyTemplate = (tpl) => {
    setName(tpl.name);
    setDescription(tpl.description);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      onToast?.('Please enter both name and description', 'error');
      return;
    }
    const existingIds = customPersonas.map(p => p.id);
    const newId = slugifyPersonaId(name, existingIds);
    onSave({ id: newId, name: name.trim(), description: description.trim() });
    setName('');
    setDescription('');
    onToast?.(`Added custom persona: "${name}"`, 'success');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h3 className="panel-title">
            <Sparkles size={18} color="#818cf8" /> Custom Persona Builder
          </h3>
          <button type="button" className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <p className="small muted">
          Design custom communication personas. Defined personas are processed directly by Gemini AI and saved locally.
        </p>

        {/* Templates */}
        <div>
          <span className="tiny subtle" style={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Quick Presets / Templates:
          </span>
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            {COLLEGE_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                className="chip tiny"
                onClick={() => handleApplyTemplate(tpl)}
              >
                + {tpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="stack" style={{ gap: 12 }}>
          <div>
            <label className="field-label">Persona Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Placement HR, Dean Note, Tech Lead..."
              maxLength={40}
            />
          </div>

          <div>
            <label className="field-label">Tone Guidelines & Audience Instructions</label>
            <textarea
              className="textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain how this persona should write, what tone to adopt, and how to treat deadlines..."
              maxLength={400}
            />
            <span className="tiny subtle" style={{ display: 'block', textAlign: 'right', marginTop: 2 }}>
              {description.length}/400
            </span>
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            <Plus size={15} /> Save Persona
          </button>
        </form>

        {/* Existing Custom Personas */}
        {customPersonas.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h4 className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              Active Custom Personas ({customPersonas.length})
            </h4>
            <div className="stack" style={{ gap: 8 }}>
              {customPersonas.map((p) => (
                <div key={p.id} className="inset row-between">
                  <div>
                    <strong style={{ fontSize: 13, color: '#a5b4fc' }}>{p.name}</strong>
                    <p className="tiny muted" style={{ marginTop: 2 }}>{p.description}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => onDelete(p.id)}
                    title="Delete persona"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

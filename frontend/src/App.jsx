import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, Sliders, ShieldCheck, Lock, Mic, Square, RotateCcw,
  Download, Printer, Plus, Activity, Radar, GitCompareArrows,
  Search, History, AlertTriangle, Send, Copy, Check, FileText,
  Volume2, Eye, LayoutList, CheckCircle2, ChevronRight, ArrowRight,
  TrendingUp, Terminal, Star, Trash2
} from 'lucide-react';

import {
  BUILT_IN_PERSONAS,
  PRESETS,
  DECODER_PRESETS,
  CHANNELS,
  LENGTHS,
  LANGUAGES,
  SLIDERS,
  DEFAULT_SLIDERS,
  MAX_DRAFT_CHARS,
  DEMO_DRAFT
} from './constants';

import { api } from './lib/api';
import { usePersistentState, useHistory } from './lib/storage';
import { useSpeechInput, useSpeaker } from './lib/speech';
import { buildMarkdownReport, downloadTextFile, printReport, copyText } from './lib/export';
import { buildPersonaRegistry, personaColor, slidersToTarget, slugifyPersonaId } from './lib/personas';

import { useToasts, ToastStack } from './components/Toasts';
import DiffView, { DiffLegend } from './components/DiffView';
import InsightsPanel from './components/InsightsPanel';
import CompareView from './components/CompareView';

const COLLEGE_TEMPLATES = [
  {
    name: 'Professor Email',
    tagline: 'Academic Etiquette',
    description: 'Polite, deferential, academic tone. Preserves deadlines, states reason respectfully, and includes polite closing.'
  },
  {
    name: 'Placement HR Follow-up',
    tagline: 'Campus Recruitment',
    description: 'Professional, confident campus placement drive query. Respectful of recruitment timelines while requesting status.'
  },
  {
    name: 'Investor Update',
    tagline: 'Executive Brevity',
    description: 'Crisp, metrics-driven, highlights growth, risks, and next quarterly milestones without technical jargon.'
  },
  {
    name: 'Customer Apology',
    tagline: 'De-escalation & Care',
    description: 'Empathetic, accountable, zero excuses, offering immediate remediation and goodwill credit.'
  }
];

export default function App() {
  const { toasts, notify } = useToasts();
  const history = useHistory();

  // Navigation tab: 'studio' | 'radar' | 'compare' | 'decoder' | 'foundry' | 'vault'
  const [activeTab, setActiveTab] = useState('studio');

  // Input states
  const [draft, setDraft] = useState(DEMO_DRAFT);
  const [channel, setChannel] = useState('email');
  const [length, setLength] = useState('standard');
  const [language, setLanguage] = useState('en');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS);

  // Custom Personas & Selection
  const [customPersonas, setCustomPersonas] = usePersistentState('prismtone.custom_personas.v1', []);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState(['executive', 'peer', 'legal', 'gen_z']);

  // Results & View modes
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [activePersonaId, setActivePersonaId] = useState('executive');
  const [stageViewMode, setStageViewMode] = useState('focus'); // 'focus' | 'stream'
  const [diffMode, setDiffMode] = useState(false);
  const [factsDrawerOpen, setFactsDrawerOpen] = useState(false);
  const [copiedStage, setCopiedStage] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);

  // Tone Decoder State
  const [decoderInput, setDecoderInput] = useState(DECODER_PRESETS[0]);
  const [decoderLoading, setDecoderLoading] = useState(false);
  const [decoderResult, setDecoderResult] = useState(null);
  const [copiedReplyIdx, setCopiedReplyIdx] = useState(null);

  // Persona Foundry (Builder) state
  const [foundryName, setFoundryName] = useState('');
  const [foundryDesc, setFoundryDesc] = useState('');

  // History search state
  const [historySearch, setHistorySearch] = useState('');
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);

  // Persona registry lookup
  const registry = useMemo(() => buildPersonaRegistry(customPersonas), [customPersonas]);

  // Audio / Speech Input & Output
  const speechLang = LANGUAGES.find((l) => l.id === language)?.speech || 'en-IN';
  const speechInput = useSpeechInput({
    lang: speechLang,
    onFinalText: (finalText) => {
      setDraft((prev) => (prev ? `${prev.trim()} ${finalText}` : finalText));
      notify('Voice transcription added to draft!', 'info');
    }
  });

  const speaker = useSpeaker();

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeTab === 'studio') handleTransform();
        else if (activeTab === 'decoder') handleDecode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Initial transform on mount
  useEffect(() => {
    handleTransform(DEMO_DRAFT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primary Transform Handler
  async function handleTransform(textOverride = null) {
    const textToRun = textOverride !== null ? textOverride : draft;
    if (!textToRun.trim()) {
      notify('Please enter a draft to transform.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        draft: textToRun,
        personas: selectedPersonaIds.length > 0 ? selectedPersonaIds : ['executive', 'peer', 'legal', 'gen_z'],
        channel,
        length,
        language,
        privacy_mode: privacyMode,
        sliders: slidersOpen ? sliders : DEFAULT_SLIDERS,
        custom_personas: customPersonas
      };

      const resp = await api.transform(payload);
      setResults(resp);

      // Make sure active persona is in the results
      const resIds = Object.keys(resp.results);
      if (resIds.length > 0 && !resIds.includes(activePersonaId)) {
        setActivePersonaId(resIds[0]);
      }

      history.add({
        draft: textToRun,
        channel,
        language,
        result: resp
      });

      notify(`Transformed across ${resIds.length} personas via ${resp.model_used.replace('models/', '')}`, 'success');
    } catch (err) {
      console.error('Transform error:', err);
      notify(err.message || 'Transform failed. Check your connection or API quota.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Single-Persona Retry
  async function handleRegenerateSingle(personaId) {
    if (!draft.trim()) return;
    setRegeneratingId(personaId);
    try {
      const payload = {
        draft,
        personas: [personaId],
        channel,
        length,
        language,
        privacy_mode: privacyMode,
        sliders: slidersOpen ? sliders : DEFAULT_SLIDERS,
        custom_personas: customPersonas
      };

      const resp = await api.transform(payload);
      if (resp.results && resp.results[personaId]) {
        setResults((prev) => (prev ? {
          ...prev,
          ai_engine: resp.ai_engine,
          model_used: resp.model_used,
          processing_time_ms: resp.processing_time_ms,
          results: {
            ...prev.results,
            [personaId]: resp.results[personaId]
          }
        } : resp));
        notify(`Regenerated ${registry[personaId]?.name || personaId}!`, 'success');
      }
    } catch (err) {
      notify(`Retry failed: ${err.message}`, 'error');
    } finally {
      setRegeneratingId(null);
    }
  }

  // Tone Decoder
  async function handleDecode(incomingOverride = null) {
    const textToDecode = incomingOverride !== null ? incomingOverride : decoderInput;
    if (!textToDecode.trim()) return;

    setDecoderLoading(true);
    try {
      const resp = await api.decode(textToDecode);
      setDecoderResult(resp);
      notify('Subtext decoded with tactical responses!', 'success');
    } catch (err) {
      notify(`Decoder error: ${err.message}`, 'error');
    } finally {
      setDecoderLoading(false);
    }
  }

  // Copy helper
  const handleCopyText = async (text, onDone) => {
    const ok = await copyText(text);
    if (ok) {
      onDone();
      notify('Copied to clipboard!', 'success');
    }
  };

  // Persona selection toggle
  const togglePersonaSelection = (id) => {
    setSelectedPersonaIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          notify('Select at least 1 persona.', 'error');
          return prev;
        }
        return prev.filter((pid) => pid !== id);
      }
      return [...prev, id];
    });
  };

  // Add Custom Persona from Foundry
  const handleCreateCustomPersona = (e) => {
    e?.preventDefault();
    if (!foundryName.trim() || !foundryDesc.trim()) {
      notify('Please provide both name and prompt description.', 'error');
      return;
    }
    const newId = slugifyPersonaId(foundryName, customPersonas.map((p) => p.id));
    const created = { id: newId, name: foundryName.trim(), description: foundryDesc.trim() };
    setCustomPersonas((prev) => [...prev, created]);
    setSelectedPersonaIds((prev) => [...prev, newId]);
    setActivePersonaId(newId);
    setFoundryName('');
    setFoundryDesc('');
    notify(`Created persona "${created.name}"!`, 'success');
    setActiveTab('studio');
  };

  const handleDeleteCustomPersona = (id) => {
    setCustomPersonas((prev) => prev.filter((p) => p.id !== id));
    setSelectedPersonaIds((prev) => prev.filter((pid) => pid !== id));
    if (activePersonaId === id) setActivePersonaId('executive');
    notify('Custom persona removed.', 'info');
  };

  const handleApplyFoundryTemplate = (tpl) => {
    setFoundryName(tpl.name);
    setFoundryDesc(tpl.description);
    notify(`Loaded "${tpl.name}" template.`, 'info');
  };

  // Export report
  const handleExportMarkdown = () => {
    if (!results) return;
    const md = buildMarkdownReport(results);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`prismtone-report-${dateStr}.md`, md);
    notify('Downloaded Markdown report!', 'success');
  };

  // Spotlight 1-click Vibeathon Demo
  const runOfficialDemo = () => {
    setDraft(DEMO_DRAFT);
    setSelectedPersonaIds(['executive', 'peer', 'legal', 'gen_z']);
    setActiveTab('studio');
    handleTransform(DEMO_DRAFT);
  };

  // Active persona object in results
  const currentPersonaCard = results?.results?.[activePersonaId] || (results?.results ? Object.values(results.results)[0] : null);
  const currentAccent = currentPersonaCard ? personaColor(registry, currentPersonaCard.persona_id) : '#818cf8';

  // Available persona list
  const availablePersonaList = useMemo(() => {
    return [
      ...BUILT_IN_PERSONAS,
      ...customPersonas.map((c) => ({
        id: c.id,
        name: c.name,
        color: personaColor(registry, c.id)
      }))
    ];
  }, [customPersonas, registry]);

  // Filtered history list
  const filteredHistory = useMemo(() => {
    let list = history.items;
    if (filterStarredOnly) list = list.filter((i) => i.starred);
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter((i) => i.draft.toLowerCase().includes(q));
    }
    return list;
  }, [history.items, filterStarredOnly, historySearch]);

  return (
    <div className="app-container">
      {/* ============================================================== */}
      {/* 1. GLASS HEADER BAR                                            */}
      {/* ============================================================== */}
      <header className="glass-header">
        <div className="brand-section">
          <div className="brand-mark">
            <Sparkles size={22} color="#ffffff" />
          </div>
          <div>
            <div className="brand-title">
              <span>PrismTone</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', letterSpacing: '0.4px' }}>
                AI ENGINE
              </span>
            </div>
            <p className="brand-subtitle">
              Multi-Persona Communication Transformer &amp; Proof Engine
            </p>
          </div>
        </div>

        <div className="row-center" style={{ gap: 10 }}>
          {/* Spotlight Stage Button */}
          <button
            type="button"
            className="stage-btn"
            onClick={runOfficialDemo}
            title="Load Official Vibeathon Outage Demo"
            style={{ borderColor: 'rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.12)', color: '#c7d2fe' }}
          >
            <Sparkles size={14} color="#818cf8" />
            <span>⚡ Vibeathon Demo</span>
          </button>

          {/* Export Report Actions */}
          {results && (
            <>
              <button
                type="button"
                className="stage-btn no-print"
                onClick={handleExportMarkdown}
                title="Download full audit report as Markdown"
              >
                <Download size={13} /> Export MD
              </button>
              <button
                type="button"
                className="stage-btn no-print"
                onClick={printReport}
                title="Print or Save as PDF"
              >
                <Printer size={13} /> PDF
              </button>
            </>
          )}

          {/* Model Status Telemetry */}
          <div
            className="stage-btn"
            style={{ cursor: 'default', background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', color: '#34d399' }}
            title="Active Model: Gemini 3.6 Flash"
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span className="mono" style={{ fontSize: 11 }}>
              {results?.model_used ? results.model_used.replace('models/', '') : 'gemini-3.6-flash'}
            </span>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. DOCKED FLOATING NAVIGATION TABS                             */}
      {/* ============================================================== */}
      <nav className="nav-dock" aria-label="Main Navigation">
        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('studio')}
        >
          <Sparkles size={15} />
          <span>Studio Workspace</span>
        </button>

        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          <Radar size={15} />
          <span>Tone Telemetry &amp; Radar</span>
        </button>

        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'compare' ? 'active' : ''}`}
          onClick={() => setActiveTab('compare')}
        >
          <GitCompareArrows size={15} />
          <span>Cross-Diff Inspector</span>
        </button>

        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'decoder' ? 'active' : ''}`}
          onClick={() => setActiveTab('decoder')}
        >
          <Search size={15} />
          <span>Subtext Decoder</span>
        </button>

        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'foundry' ? 'active' : ''}`}
          onClick={() => setActiveTab('foundry')}
        >
          <Plus size={15} />
          <span>Persona Foundry</span>
          {customPersonas.length > 0 && <span className="tab-badge">{customPersonas.length}</span>}
        </button>

        <button
          type="button"
          className={`nav-tab-item ${activeTab === 'vault' ? 'active' : ''}`}
          onClick={() => setActiveTab('vault')}
        >
          <History size={15} />
          <span>History &amp; Vault</span>
          <span className="tab-badge">{history.items.length}</span>
        </button>
      </nav>

      {/* ============================================================== */}
      {/* TAB 1: STUDIO WORKSPACE (ANTI-CARD SPLIT LAYOUT)               */}
      {/* ============================================================== */}
      {activeTab === 'studio' && (
        <div className="studio-grid animate-tab-enter">
          {/* Left Column: Command Console */}
          <aside className="command-console">
            {/* Active Persona Toggles */}
            <div>
              <div className="console-section-title">
                <span>Target Personas ({selectedPersonaIds.length})</span>
                <span className="subtle" style={{ fontSize: 10 }}>Click to toggle</span>
              </div>
              <div className="persona-chips-rail">
                {availablePersonaList.map((p) => {
                  const active = selectedPersonaIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`persona-toggle-pill ${active ? 'active' : ''}`}
                      style={{ '--persona-accent': p.color }}
                      onClick={() => togglePersonaSelection(p.id)}
                    >
                      <span className="pill-dot" />
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Console Box */}
            <div className="prompt-box-wrapper">
              <div className="console-section-title" style={{ marginBottom: 6 }}>
                <span>Unvarnished Thought / Draft</span>
                <span className={`mono ${draft.length > MAX_DRAFT_CHARS ? 'fact-missing' : 'subtle'}`} style={{ fontSize: 10 }}>
                  {draft.length}/{MAX_DRAFT_CHARS}
                </span>
              </div>

              <textarea
                className="prompt-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type or speak what you really mean (e.g. 'Server went down, it's Raj's fault, fix by Friday.')..."
              />

              {/* Dictation Waveform Banner */}
              {speechInput.listening && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    marginTop: 8
                  }}
                >
                  <div className="row-center">
                    <span className="mic-active-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#fca5a5' }}>
                      <strong>Dictating:</strong> {speechInput.interim || 'Listening to your microphone...'}
                    </span>
                  </div>
                  <button type="button" onClick={speechInput.stop} className="stage-btn" style={{ padding: '3px 8px', fontSize: 10 }}>
                    <Square size={10} /> Stop
                  </button>
                </div>
              )}

              <div className="prompt-footer">
                <div className="row-center">
                  {speechInput.supported && (
                    <button
                      type="button"
                      className={`stage-btn ${speechInput.listening ? 'mic-active-pulse' : ''}`}
                      style={{
                        padding: '4px 10px',
                        background: speechInput.listening ? 'rgba(239,68,68,0.2)' : undefined,
                        color: speechInput.listening ? '#fca5a5' : undefined
                      }}
                      onClick={speechInput.listening ? speechInput.stop : speechInput.start}
                      title="Dictate with voice input"
                    >
                      <Mic size={12} />
                      <span>{speechInput.listening ? 'Recording...' : 'Voice Input'}</span>
                    </button>
                  )}
                </div>

                <div className="row-center subtle">
                  <span>Shortcut:</span>
                  <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', fontSize: 10, fontFamily: 'monospace' }}>
                    ⌘ Enter
                  </kbd>
                </div>
              </div>
            </div>

            {/* Quick Scenario Presets */}
            <div>
              <div className="console-section-title">
                <span>Scenario Presets</span>
              </div>
              <div className="preset-strip">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setDraft(p.draft);
                      handleTransform(p.draft);
                    }}
                  >
                    <span>{p.title}</span>
                    <ChevronRight size={13} className="subtle" />
                  </button>
                ))}
              </div>
            </div>

            {/* Channel, Length, Language controls */}
            <div className="controls-subgrid">
              <div className="control-item">
                <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>CHANNEL</span>
                <select className="control-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>

              <div className="control-item">
                <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>LENGTH</span>
                <select className="control-select" value={length} onChange={(e) => setLength(e.target.value)}>
                  {LENGTHS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div className="control-item">
                <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>LANGUAGE</span>
                <select className="control-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sliders and Privacy Toggles */}
            <div className="row-between">
              <button
                type="button"
                className="stage-btn"
                style={{
                  background: privacyMode ? 'rgba(16,185,129,0.1)' : undefined,
                  borderColor: privacyMode ? 'rgba(16,185,129,0.3)' : undefined,
                  color: privacyMode ? '#34d399' : undefined
                }}
                onClick={() => setPrivacyMode(!privacyMode)}
                title="Client-side PII Redaction Guard"
              >
                <Lock size={12} />
                <span>Privacy Guard: {privacyMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                className="stage-btn"
                style={{
                  background: slidersOpen ? 'rgba(99,102,241,0.15)' : undefined,
                  borderColor: slidersOpen ? 'rgba(99,102,241,0.4)' : undefined,
                  color: slidersOpen ? '#a5b4fc' : undefined
                }}
                onClick={() => setSlidersOpen(!slidersOpen)}
              >
                <Sliders size={12} />
                <span>Tone Sliders {slidersOpen ? '▲' : '▼'}</span>
              </button>
            </div>

            {/* Expandable Sliders Sheet */}
            {slidersOpen && (
              <div className="sliders-sheet">
                <div className="row-between">
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>5-Axis Tone Calibration</span>
                  <button
                    type="button"
                    style={{ fontSize: 10, color: '#94a3b8' }}
                    onClick={() => setSliders(DEFAULT_SLIDERS)}
                  >
                    Reset
                  </button>
                </div>
                {SLIDERS.map((s) => (
                  <div key={s.key} className="slider-row">
                    <div className="slider-labels">
                      <span className="subtle">{s.label}</span>
                      <span className="mono" style={{ color: '#818cf8', fontWeight: 700 }}>{sliders[s.key]}/10</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      className="modern-slider"
                      value={sliders[s.key]}
                      onChange={(e) => setSliders({ ...sliders, [s.key]: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Run Button */}
            <button
              type="button"
              className="btn-prism-run"
              onClick={() => handleTransform()}
              disabled={loading}
            >
              <Sparkles size={16} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Synthesizing Personas...' : 'Transform Across Personas'}</span>
            </button>
          </aside>

          {/* Right Column: Unified Persona Stage (No Boxy Cards!) */}
          <main className="stage-surface" style={{ '--active-persona-color': currentAccent }}>
            {/* Stage Header Rail */}
            <div className="stage-header-rail">
              <div className="stage-persona-tabs">
                {results?.results && Object.values(results.results).map((item) => {
                  const isActive = activePersonaId === item.persona_id;
                  const color = personaColor(registry, item.persona_id);
                  return (
                    <button
                      key={item.persona_id}
                      type="button"
                      className={`stage-tab-btn ${isActive ? 'active' : ''}`}
                      onClick={() => setActivePersonaId(item.persona_id)}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: color,
                          display: 'inline-block',
                          boxShadow: isActive ? `0 0 10px ${color}` : 'none'
                        }}
                      />
                      <span>{item.persona_name}</span>
                    </button>
                  );
                })}
              </div>

              {/* View Switcher: Focus Single Persona vs Stream Flow */}
              <div className="stage-view-toggle">
                <button
                  type="button"
                  className={`stage-view-btn ${stageViewMode === 'focus' ? 'active' : ''}`}
                  onClick={() => setStageViewMode('focus')}
                  title="Focus mode: deeply inspect active persona"
                >
                  Focus View
                </button>
                <button
                  type="button"
                  className={`stage-view-btn ${stageViewMode === 'stream' ? 'active' : ''}`}
                  onClick={() => setStageViewMode('stream')}
                  title="Stream mode: view all persona rewrites consecutively"
                >
                  Stream View
                </button>
              </div>
            </div>

            {/* Loading Indicator */}
            {loading && !results && (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <Sparkles size={32} color="#818cf8" className="animate-spin" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontWeight: 600 }}>Synthesizing multi-persona communications...</p>
                <p className="subtle" style={{ fontSize: 12, marginTop: 4 }}>Applying single-shot contrastive reasoning via Gemini 3.6 Flash</p>
              </div>
            )}

            {/* FOCUS VIEW (Active Persona Spotlight) */}
            {stageViewMode === 'focus' && currentPersonaCard && (
              <div className="stage-viewport animate-tab-enter" key={currentPersonaCard.persona_id}>
                {/* Persona Header & Fact Guard Badge */}
                <div className="stage-persona-meta">
                  <div className="persona-headline">
                    <h2>
                      <span style={{ color: currentAccent }}>{currentPersonaCard.persona_name}</span>
                    </h2>
                    <p>{currentPersonaCard.tagline}</p>
                  </div>

                  <button
                    type="button"
                    className={`fact-guard-badge ${currentPersonaCard.fact_guard_status}`}
                    onClick={() => setFactsDrawerOpen(!factsDrawerOpen)}
                    title="Click to toggle fact preservation audit matrix"
                  >
                    <ShieldCheck size={14} />
                    <span>
                      {currentPersonaCard.fact_guard_status === 'green' ? 'Facts Preserved' : currentPersonaCard.fact_guard_status === 'amber' ? 'Check Facts' : 'Fact Alert'}
                    </span>
                  </button>
                </div>

                {/* Fact Guard Matrix Drawer */}
                {factsDrawerOpen && (
                  <div className="fact-guard-matrix">
                    <div className="row-between" style={{ paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>Fact Guard Verification Matrix</span>
                      <span className="subtle" style={{ fontSize: 10 }}>Dates, numbers, names &amp; commitments</span>
                    </div>
                    {currentPersonaCard.facts_found.length === 0 && (
                      <span className="subtle" style={{ fontSize: 12 }}>No critical facts detected in draft.</span>
                    )}
                    {currentPersonaCard.facts_found.map((f, i) => (
                      <div key={i} className="fact-matrix-row">
                        <div>
                          <code style={{ color: '#ffffff' }}>{f.text}</code>
                          <span className="subtle" style={{ marginLeft: 6 }}>({f.category})</span>
                        </div>
                        <span style={{
                          fontWeight: 700,
                          color: f.status === 'preserved' ? '#34d399' : f.status === 'modified' ? '#fbbf24' : '#f87171'
                        }}>
                          {f.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Subject Line if present */}
                {currentPersonaCard.subject_line && (
                  <div className="subject-banner">
                    <span>Subject:</span>
                    <strong>{currentPersonaCard.subject_line}</strong>
                  </div>
                )}

                {/* The Canvas Content (Diff or Clean) */}
                <div className="canvas-paper">
                  {diffMode ? (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <DiffLegend />
                      </div>
                      <DiffView tokens={currentPersonaCard.diff_tokens} />
                    </div>
                  ) : (
                    currentPersonaCard.rewrite
                  )}
                </div>

                {/* Rationale & Risk alerts */}
                {currentPersonaCard.change_notes?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>Why this changed:</strong>
                    <ul style={{ paddingLeft: 18 }}>
                      {currentPersonaCard.change_notes.map((note, idx) => (
                        <li key={idx} style={{ marginBottom: 2 }}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentPersonaCard.risk_flags?.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                    fontSize: 12
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span><strong>Risk note:</strong> {currentPersonaCard.risk_flags.join(' • ')}</span>
                  </div>
                )}

                {/* Floating Canvas Action Bar */}
                <div className="stage-action-bar">
                  <div className="action-btn-group">
                    {/* Diff Toggle */}
                    <button
                      type="button"
                      className={`stage-btn ${diffMode ? 'speaking' : ''}`}
                      onClick={() => setDiffMode(!diffMode)}
                      title="Toggle inline word-level diff highlights"
                    >
                      <Eye size={12} />
                      <span>{diffMode ? 'Diff Active' : 'Word Diff'}</span>
                    </button>

                    {/* Listen with soundwave animation */}
                    {speaker.supported && (
                      <button
                        type="button"
                        className={`stage-btn ${speaker.speakingId === currentPersonaCard.persona_id ? 'speaking' : ''}`}
                        onClick={() => speaker.toggle(currentPersonaCard.persona_id, currentPersonaCard.rewrite)}
                        title="Listen to this persona's voice style"
                      >
                        {speaker.speakingId === currentPersonaCard.persona_id ? (
                          <>
                            <div className="soundwave">
                              <span /><span /><span /><span />
                            </div>
                            <span>Playing</span>
                          </>
                        ) : (
                          <>
                            <Volume2 size={12} />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Single Persona Retry */}
                    <button
                      type="button"
                      className="stage-btn"
                      onClick={() => handleRegenerateSingle(currentPersonaCard.persona_id)}
                      disabled={regeneratingId === currentPersonaCard.persona_id}
                      title="Regenerate this specific voice"
                    >
                      <RotateCcw size={12} className={regeneratingId === currentPersonaCard.persona_id ? 'animate-spin' : ''} />
                      <span>Retry</span>
                    </button>
                  </div>

                  {/* Copy Button */}
                  <button
                    type="button"
                    className={`stage-btn ${copiedStage ? 'copied' : ''}`}
                    onClick={() => handleCopyText(currentPersonaCard.rewrite, () => {
                      setCopiedStage(true);
                      setTimeout(() => setCopiedStage(false), 2000);
                    })}
                  >
                    {copiedStage ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedStage ? 'Copied!' : 'Copy Rewrite'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* STREAM VIEW (All Personas Seamless Flow) */}
            {stageViewMode === 'stream' && results?.results && (
              <div className="stream-flow-container animate-tab-enter">
                {Object.values(results.results).map((item) => {
                  const color = personaColor(registry, item.persona_id);
                  return (
                    <article key={item.persona_id} className="stream-flow-item">
                      <div className="row-between">
                        <div className="row-center">
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                          <h3 style={{ fontSize: 17, fontWeight: 800 }}>{item.persona_name}</h3>
                          <span className="subtle" style={{ fontSize: 12 }}>• {item.tagline}</span>
                        </div>

                        <div className="row-center">
                          <span className={`fact-guard-badge ${item.fact_guard_status}`} style={{ fontSize: 11, padding: '3px 8px' }}>
                            <ShieldCheck size={12} /> {item.fact_guard_status}
                          </span>
                          <button
                            type="button"
                            className="stage-btn"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => handleCopyText(item.rewrite, () => {
                              notify(`Copied ${item.persona_name}!`, 'success');
                            })}
                          >
                            <Copy size={11} /> Copy
                          </button>
                        </div>
                      </div>

                      {item.subject_line && (
                        <div className="subject-banner">
                          <span>Subject:</span> <strong>{item.subject_line}</strong>
                        </div>
                      )}

                      <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {item.rewrite}
                      </div>

                      <div className="row-between subtle" style={{ fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
                        <span>Change Score: <strong style={{ color: '#818cf8' }}>{item.metrics.change_score}/100</strong></span>
                        <span>Formality: <strong>{item.metrics.formality}</strong> • Warmth: <strong>{item.metrics.warmth}</strong> • Brevity: <strong>{item.metrics.brevity}</strong></span>
                        <span>{item.metrics.reading_level_label}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Streamlined Metrics Footer Dock */}
            {currentPersonaCard && stageViewMode === 'focus' && (
              <footer className="stage-metrics-dock">
                <div className="metric-bar-group">
                  <div className="row-between" style={{ fontSize: 10 }}>
                    <span className="metric-stat-label">CHANGE SCORE</span>
                    <strong className="mono" style={{ color: '#818cf8' }}>{currentPersonaCard.metrics.change_score}/100</strong>
                  </div>
                  <div className="metric-track">
                    <div className="metric-fill" style={{ width: `${currentPersonaCard.metrics.change_score}%` }} />
                  </div>
                </div>

                <div className="metric-stat-box">
                  <span className="metric-stat-label">FORMALITY</span>
                  <span className="metric-stat-value">{currentPersonaCard.metrics.formality}/10</span>
                </div>

                <div className="metric-stat-box">
                  <span className="metric-stat-label">WARMTH</span>
                  <span className="metric-stat-value">{currentPersonaCard.metrics.warmth}/10</span>
                </div>

                <div className="metric-stat-box">
                  <span className="metric-stat-label">DIRECTNESS</span>
                  <span className="metric-stat-value">{currentPersonaCard.metrics.directness}/10</span>
                </div>

                <div className="metric-stat-box" style={{ textAlign: 'right' }}>
                  <span className="metric-stat-label">READABILITY</span>
                  <span className="subtle" style={{ fontSize: 12 }}>{currentPersonaCard.metrics.reading_level_label}</span>
                </div>
              </footer>
            )}
          </main>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TONE TELEMETRY & RADAR                                  */}
      {/* ============================================================== */}
      {activeTab === 'radar' && (
        <div className="telemetry-layout animate-tab-enter">
          {results ? (
            <>
              <div className="telemetry-pane">
                <div className="telemetry-pane-header">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Radar size={18} color="#818cf8" />
                      <span>Multi-Axis Tone Radar</span>
                    </h3>
                    <p className="subtle" style={{ fontSize: 12 }}>Interactive comparison of Formality, Warmth, Brevity, Directness, and Readability</p>
                  </div>
                  <span className="stage-btn" style={{ fontSize: 11, cursor: 'default' }}>
                    {Object.keys(results.results).length} Voices Visualized
                  </span>
                </div>

                <InsightsPanel
                  result={results}
                  registry={registry}
                  target={slidersOpen ? slidersToTarget(sliders) : null}
                />
              </div>

              <div className="telemetry-pane">
                <div className="telemetry-pane-header">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={18} color="#10b981" />
                      <span>Linguistic Shift Metrics</span>
                    </h3>
                    <p className="subtle" style={{ fontSize: 12 }}>Side-by-side behavioral metrics compared against original baseline</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {Object.values(results.results).map((c) => {
                    const color = personaColor(registry, c.persona_id);
                    return (
                      <div
                        key={c.persona_id}
                        style={{
                          padding: '14px 18px',
                          borderRadius: 12,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-hairline)',
                          borderLeft: `4px solid ${color}`
                        }}
                      >
                        <div className="row-between" style={{ marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{c.persona_name}</span>
                          <span className="mono" style={{ fontSize: 12, color: '#818cf8' }}>
                            Score: {c.metrics.change_score}/100
                          </span>
                        </div>
                        <div className="row-between subtle" style={{ fontSize: 12 }}>
                          <span>Word Count: <strong>{c.metrics.word_count}</strong> ({c.metrics.length_change_pct >= 0 ? '+' : ''}{c.metrics.length_change_pct}%)</span>
                          <span>Flesch Grade: <strong>{c.metrics.flesch_reading_ease}</strong> ({c.metrics.reading_level_label})</span>
                          <span>Fact Guard: <strong style={{ color: '#34d399' }}>{c.fact_guard_status}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="stage-surface" style={{ padding: 48, textAlign: 'center', gridColumn: '1 / -1' }}>
              <p className="subtle">Run a transformation in the Studio tab first to view Tone Radar Telemetry.</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: CROSS-DIFF INSPECTOR                                    */}
      {/* ============================================================== */}
      {activeTab === 'compare' && (
        <div className="compare-layout animate-tab-enter">
          {results ? (
            <CompareView
              result={results}
              registry={registry}
              onToast={notify}
            />
          ) : (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <p>Run a transformation first to compare personas in the Cross-Diff Inspector.</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: REVERSE SUBTEXT DECODER                                 */}
      {/* ============================================================== */}
      {activeTab === 'decoder' && (
        <div className="decoder-terminal animate-tab-enter">
          <section className="decoder-input-panel">
            <div className="row-between">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Search size={18} color="#818cf8" />
                  <span>Subtext Decoder &amp; Tactical Reply Engine (Reverse Mode)</span>
                </h3>
                <p className="subtle" style={{ fontSize: 13, marginTop: 2 }}>
                  Paste any ambiguous email, Slack message, or chat to reveal hidden subtext, emotional urgency, and 3 strategic response postures.
                </p>
              </div>

              {/* Sample Presets */}
              <div className="row-center">
                <span className="subtle" style={{ fontSize: 11 }}>Presets:</span>
                {DECODER_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className="stage-btn"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => {
                      setDecoderInput(p);
                      handleDecode(p);
                    }}
                  >
                    Sample {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className="prompt-textarea"
              style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 10, border: '1px solid var(--border-hairline)' }}
              rows={3}
              value={decoderInput}
              onChange={(e) => setDecoderInput(e.target.value)}
              placeholder="Paste incoming message to decode (e.g. 'Per my last email, please fix this ASAP or I will escalate to the VP.')..."
            />

            <div className="row-between">
              <span className="subtle" style={{ fontSize: 12 }}>Shortcut: ⌘ Enter</span>
              <button
                type="button"
                className="btn-prism-run"
                style={{ width: 'auto', padding: '10px 24px' }}
                onClick={() => handleDecode()}
                disabled={decoderLoading}
              >
                <Search size={14} className={decoderLoading ? 'animate-spin' : ''} />
                <span>{decoderLoading ? 'Decoding Subtext...' : 'Decode True Subtext'}</span>
              </button>
            </div>
          </section>

          {/* Decoded Insights Grid */}
          {decoderResult && (
            <div className="decoder-output-grid animate-tab-enter">
              {/* Intent & Risk Column */}
              <div className="decoder-insight-column">
                <div className="row-between" style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: 10 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={16} color="#10b981" />
                    <span>Linguistic Analysis</span>
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="subtle" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Surface Meaning</span>
                  <p style={{ fontSize: 14, background: 'var(--bg-input)', padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)' }}>
                    {decoderResult.surface_meaning}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#818cf8' }}>
                    🕵️ True Subtext &amp; Unspoken Intent
                  </span>
                  <p style={{ fontSize: 14, fontWeight: 500, background: 'rgba(99,102,241,0.08)', padding: 14, borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
                    {decoderResult.subtext}
                  </p>
                </div>

                <div className="row-between" style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)' }}>
                  <div>
                    <span className="subtle" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Emotional Thermometer</span>
                    <strong style={{ color: '#f59e0b', fontSize: 14 }}>{decoderResult.emotional_temperature}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="subtle" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Urgency Level</span>
                    <strong style={{ color: '#ec4899', fontSize: 14 }}>{decoderResult.urgency_level}</strong>
                  </div>
                </div>

                {decoderResult.hidden_motives && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24',
                    fontSize: 12
                  }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span><strong>Hidden Motive / Escalation Risk:</strong> {decoderResult.hidden_motives}</span>
                  </div>
                )}
              </div>

              {/* Ready-to-Send Tactical Replies */}
              <div className="decoder-insight-column">
                <div className="row-between" style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: 10 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Send size={16} color="#818cf8" />
                    <span>Ready-to-Send Tactical Responses</span>
                  </h4>
                  <span className="subtle" style={{ fontSize: 11 }}>1-click copy</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {decoderResult.recommended_responses?.map((reply, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-hairline)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div className="row-between">
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(99,102,241,0.15)',
                          color: '#a5b4fc',
                          textTransform: 'uppercase'
                        }}>
                          {reply.strategy}
                        </span>

                        <button
                          type="button"
                          className="stage-btn"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => handleCopyText(reply.text, () => {
                            setCopiedReplyIdx(idx);
                            setTimeout(() => setCopiedReplyIdx(null), 2000);
                          })}
                        >
                          {copiedReplyIdx === idx ? <Check size={11} /> : <Copy size={11} />}
                          <span>{copiedReplyIdx === idx ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#f1f5f9' }}>
                        "{reply.text}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: PERSONA FOUNDRY (CUSTOM BUILDER WORKSPACE)              */}
      {/* ============================================================== */}
      {activeTab === 'foundry' && (
        <div className="foundry-layout animate-tab-enter">
          {/* Creator Pane */}
          <div className="foundry-creator">
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>Create Custom Persona</h3>
              <p className="subtle" style={{ fontSize: 13, marginTop: 2 }}>
                Define a unique communication identity with custom tone instructions.
              </p>
            </div>

            <form onSubmit={handleCreateCustomPersona} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="subtle" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  PERSONA NAME
                </label>
                <input
                  type="text"
                  className="control-select"
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14 }}
                  value={foundryName}
                  onChange={(e) => setFoundryName(e.target.value)}
                  placeholder="e.g. Professor Email, Placement HR, Investor..."
                />
              </div>

              <div>
                <label className="subtle" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  TONE &amp; STYLISTIC INSTRUCTIONS
                </label>
                <textarea
                  className="prompt-textarea"
                  style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)', minHeight: 120 }}
                  value={foundryDesc}
                  onChange={(e) => setFoundryDesc(e.target.value)}
                  placeholder="e.g. Academic and polite tone, states facts clearly, asks for extension respectfully while acknowledging deadline..."
                />
              </div>

              <button type="submit" className="btn-prism-run">
                <Plus size={16} />
                <span>Save to Persona Registry</span>
              </button>
            </form>

            {/* Quick College & Career Templates */}
            <div style={{ marginTop: 10 }}>
              <span className="subtle" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8 }}>
                OR START FROM A PRESET TEMPLATE:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COLLEGE_TEMPLATES.map((tpl, i) => (
                  <div key={i} className="template-card-row">
                    <div>
                      <strong style={{ fontSize: 13, display: 'block' }}>{tpl.name}</strong>
                      <span className="subtle" style={{ fontSize: 11 }}>{tpl.tagline}</span>
                    </div>
                    <button
                      type="button"
                      className="stage-btn"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => handleApplyFoundryTemplate(tpl)}
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Custom Personas Library */}
          <div className="foundry-library">
            <div className="row-between" style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Active Custom Personas ({customPersonas.length})</h3>
                <p className="subtle" style={{ fontSize: 12 }}>These appear alongside built-ins in the Studio workspace.</p>
              </div>
            </div>

            {customPersonas.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <p>No custom personas created yet.</p>
                <p className="subtle" style={{ fontSize: 12, marginTop: 4 }}>Choose a template on the left or create one from scratch.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {customPersonas.map((p) => {
                  const color = personaColor(registry, p.id);
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-hairline)',
                        borderLeft: `4px solid ${color}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div className="row-between">
                        <div className="row-center">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                          <strong style={{ fontSize: 15 }}>{p.name}</strong>
                          <span className="subtle" style={{ fontSize: 11 }}>({p.id})</span>
                        </div>
                        <button
                          type="button"
                          className="stage-btn"
                          style={{ padding: '3px 8px', color: '#fca5a5' }}
                          onClick={() => handleDeleteCustomPersona(p.id)}
                          title="Delete persona"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {p.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 6: HISTORY & VAULT                                         */}
      {/* ============================================================== */}
      {activeTab === 'vault' && (
        <div className="vault-layout animate-tab-enter">
          <div className="vault-header">
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="#818cf8" />
                <span>Transformation Vault</span>
              </h3>
              <p className="subtle" style={{ fontSize: 12 }}>
                Locally persisted transformations • Starred items are preserved indefinitely
              </p>
            </div>

            <div className="row-center">
              <input
                type="text"
                placeholder="Search history..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="control-select"
                style={{ width: 180 }}
              />

              <button
                type="button"
                className={`stage-btn ${filterStarredOnly ? 'speaking' : ''}`}
                onClick={() => setFilterStarredOnly(!filterStarredOnly)}
              >
                <Star size={13} fill={filterStarredOnly ? '#fbbf24' : 'none'} color={filterStarredOnly ? '#fbbf24' : 'currentColor'} />
                <span>{filterStarredOnly ? 'Starred Only' : 'All'}</span>
              </button>

              {history.items.length > 0 && (
                <button
                  type="button"
                  className="stage-btn"
                  style={{ color: '#fca5a5' }}
                  onClick={() => {
                    history.clearUnstarred();
                    notify('Cleared unstarred history items.', 'info');
                  }}
                >
                  <Trash2 size={12} /> Clear Unstarred
                </button>
              )}
            </div>
          </div>

          <div className="vault-timeline">
            {filteredHistory.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <p>No history entries found.</p>
              </div>
            ) : (
              filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="vault-item-row"
                  onClick={() => {
                    setDraft(entry.draft);
                    if (entry.result) setResults(entry.result);
                    setActiveTab('studio');
                    notify('Loaded transformation into Studio!', 'info');
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-center" style={{ marginBottom: 4 }}>
                      <span className="mono subtle" style={{ fontSize: 11 }}>
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                        {entry.channel}
                      </span>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                        {entry.language}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{entry.draft}"
                    </p>
                  </div>

                  <div className="row-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="stage-btn"
                      style={{ padding: '6px 10px' }}
                      onClick={() => history.toggleStar(entry.id)}
                    >
                      <Star size={13} fill={entry.starred ? '#fbbf24' : 'none'} color={entry.starred ? '#fbbf24' : '#94a3b8'} />
                    </button>
                    <button
                      type="button"
                      className="stage-btn"
                      style={{ padding: '6px 10px', color: '#fca5a5' }}
                      onClick={() => history.remove(entry.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Floating Toast Stack */}
      <ToastStack toasts={toasts} />
    </div>
  );
}

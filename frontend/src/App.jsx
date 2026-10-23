import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles, Sliders, ShieldCheck, Lock, Mic, Square, RotateCcw,
  Download, Printer, Plus, Activity, Radar, GitCompareArrows,
  Search, History, AlertTriangle, Send, Copy, Check, Info, FileText
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
import { buildPersonaRegistry, personaColor, slidersToTarget } from './lib/personas';

import { useToasts, ToastStack } from './components/Toasts';
import PersonaCard, { PersonaCardSkeleton } from './components/PersonaCard';
import InsightsPanel from './components/InsightsPanel';
import CompareView from './components/CompareView';
import HistoryPanel from './components/HistoryPanel';
import CustomPersonaModal from './components/CustomPersonaModal';

export default function App() {
  const { toasts, notify } = useToasts();
  const history = useHistory();

  // Navigation tab: 'generator' | 'insights' | 'compare' | 'decoder' | 'history'
  const [activeTab, setActiveTab] = useState('generator');

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
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState(['executive', 'peer', 'legal', 'gen_z']);

  // Results & View modes
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [viewModes, setViewModes] = useState({}); // { [personaId]: 'clean' | 'diff' }
  const [expandedFacts, setExpandedFacts] = useState({}); // { [personaId]: boolean }
  const [copiedId, setCopiedId] = useState(null);

  // Decoder State (Reverse Mode)
  const [decoderInput, setDecoderInput] = useState(DECODER_PRESETS[0]);
  const [decoderLoading, setDecoderLoading] = useState(false);
  const [decoderResult, setDecoderResult] = useState(null);
  const [copiedReplyIdx, setCopiedReplyIdx] = useState(null);

  // Persona registry lookup (covers built-ins + custom)
  const registry = useMemo(() => buildPersonaRegistry(customPersonas), [customPersonas]);

  // Audio / Speech Input & Output
  const speechLang = LANGUAGES.find((l) => l.id === language)?.speech || 'en-IN';
  const speechInput = useSpeechInput({
    lang: speechLang,
    onFinalText: (finalText) => {
      setDraft((prev) => (prev ? `${prev.trim()} ${finalText}` : finalText));
      notify('Voice input appended to draft!', 'info');
    }
  });

  const speaker = useSpeaker();

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to transform
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (activeTab === 'generator') {
          e.preventDefault();
          handleTransform();
        } else if (activeTab === 'decoder') {
          e.preventDefault();
          handleDecode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Initial transform on load
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

      // Save to local history
      history.add({
        draft: textToRun,
        channel,
        language,
        result: resp
      });

      notify(`Transformed across ${Object.keys(resp.results).length} personas via ${resp.model_used}`, 'success');
    } catch (err) {
      console.error('Transform error:', err);
      notify(err.message || 'Transform failed. Check your network or API quota.', 'error');
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

  // Tone Decoder (Reverse Mode)
  async function handleDecode(incomingOverride = null) {
    const textToDecode = incomingOverride !== null ? incomingOverride : decoderInput;
    if (!textToDecode.trim()) return;

    setDecoderLoading(true);
    try {
      const resp = await api.decode(textToDecode);
      setDecoderResult(resp);
      notify('Decoded subtext and tactical responses ready!', 'success');
    } catch (err) {
      notify(`Decoder error: ${err.message}`, 'error');
    } finally {
      setDecoderLoading(false);
    }
  }

  // Copy helper
  const handleCopyCard = async (personaId, text) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(personaId);
      notify('Copied rewrite to clipboard!', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCopyReply = async (index, text) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedReplyIdx(index);
      notify('Copied reply snippet!', 'success');
      setTimeout(() => setCopiedReplyIdx(null), 2000);
    }
  };

  // Custom persona management
  const handleAddCustomPersona = (p) => {
    setCustomPersonas((prev) => [...prev, p]);
    setSelectedPersonaIds((prev) => [...prev, p.id]);
  };

  const handleDeleteCustomPersona = (id) => {
    setCustomPersonas((prev) => prev.filter((p) => p.id !== id));
    setSelectedPersonaIds((prev) => prev.filter((pid) => pid !== id));
    notify('Custom persona removed.', 'info');
  };

  // Toggle selection chip
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

  // Quick export current report
  const handleExportMarkdown = () => {
    if (!results) return;
    const md = buildMarkdownReport(results);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`prismtone-report-${dateStr}.md`, md);
    notify('Downloaded Markdown report!', 'success');
  };

  // Stage Spotlight 1-click Demo Runner
  const runOfficialDemo = () => {
    setDraft(DEMO_DRAFT);
    setSelectedPersonaIds(['executive', 'peer', 'legal', 'gen_z']);
    setActiveTab('generator');
    handleTransform(DEMO_DRAFT);
  };

  const availablePersonaList = useMemo(() => {
    return [
      ...BUILT_IN_PERSONAS,
      ...customPersonas.map((c, i) => ({
        id: c.id,
        name: c.name,
        color: personaColor(registry, c.id)
      }))
    ];
  }, [customPersonas, registry]);

  return (
    <div className="app">
      {/* Top Header Bar */}
      <header className="header row-between">
        <div className="brand">
          <div className="brand-logo">
            <Sparkles size={24} color="#ffffff" />
          </div>
          <div>
            <h1>PrismTone</h1>
            <p className="tiny muted" style={{ letterSpacing: '0.2px' }}>
              Multi-Persona Communication Transformer &amp; Proof Engine • Vibeathon 2026
            </p>
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          {/* Spotlight Stage Button */}
          <button
            type="button"
            className="btn btn-solid"
            onClick={runOfficialDemo}
            title="Load Problem 1 Vibeathon Official Test Scenario"
            style={{ border: '1px solid #6366f1' }}
          >
            <Sparkles size={13} color="#a5b4fc" /> ⚡ Vibeathon Demo
          </button>

          {/* Custom Persona Builder */}
          <button
            type="button"
            className="btn"
            onClick={() => setCustomModalOpen(true)}
            title="Create a tailored persona (Professor, HR, Investor, etc.)"
          >
            <Plus size={13} /> Custom Persona
          </button>

          {/* Export Quick Actions */}
          {results && (
            <>
              <button
                type="button"
                className="btn no-print"
                onClick={handleExportMarkdown}
                title="Download full audit report as Markdown"
              >
                <Download size={13} /> Export MD
              </button>
              <button
                type="button"
                className="btn no-print"
                onClick={printReport}
                title="Print or Save as PDF"
              >
                <Printer size={13} /> PDF
              </button>
            </>
          )}

          {/* Model Status Pill */}
          <div className="badge badge-accent" title="Gemini 3.6 Flash with single-shot contrastive batching">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            {results?.model_used ? results.model_used.replace('models/', '') : 'Gemini 3.6 Flash'}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="tabs no-print" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="tab"
          aria-selected={activeTab === 'generator'}
          onClick={() => setActiveTab('generator')}
        >
          <Sparkles size={14} /> Persona Transformer
        </button>

        <button
          type="button"
          className="tab"
          aria-selected={activeTab === 'insights'}
          onClick={() => setActiveTab('insights')}
        >
          <Radar size={14} /> Visual Radar &amp; Tone Shift
        </button>

        <button
          type="button"
          className="tab"
          aria-selected={activeTab === 'compare'}
          onClick={() => setActiveTab('compare')}
        >
          <GitCompareArrows size={14} /> Dual Compare Mode
        </button>

        <button
          type="button"
          className="tab"
          aria-selected={activeTab === 'decoder'}
          onClick={() => setActiveTab('decoder')}
        >
          <Search size={14} /> Tone Decoder (Reverse Mode)
        </button>

        <button
          type="button"
          className="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        >
          <History size={14} /> History ({history.items.length})
        </button>
      </nav>

      {/* ============================================================== */}
      {/* TAB 1: PERSONA TRANSFORMER (CORE WORKSPACE)                   */}
      {/* ============================================================== */}
      {activeTab === 'generator' && (
        <div className="stack">
          {/* Input Panel */}
          <section className="panel stack" style={{ gap: 16 }}>
            {/* Persona Selection Chips */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="field-label" style={{ marginBottom: 0 }}>Active Personas ({selectedPersonaIds.length})</span>
                <span className="tiny subtle">Click to toggle which voices to generate</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {availablePersonaList.map((p) => {
                  const active = selectedPersonaIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="chip"
                      aria-pressed={active}
                      onClick={() => togglePersonaSelection(p.id)}
                      style={{
                        borderColor: active ? p.color : undefined,
                        color: active ? '#ffffff' : undefined,
                        background: active ? `${p.color}26` : undefined
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: p.color,
                          display: 'inline-block',
                          marginRight: 6
                        }}
                      />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Draft Textarea with Dictation & Counter */}
            <div style={{ position: 'relative' }}>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <label htmlFor="draft-input" className="field-label" style={{ marginBottom: 0 }}>
                  Raw Thought / Draft Communication
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`tiny ${draft.length > MAX_DRAFT_CHARS ? 'fact-missing' : 'subtle'}`}>
                    {draft.length} / {MAX_DRAFT_CHARS} chars
                  </span>
                </div>
              </div>

              <textarea
                id="draft-input"
                className={`textarea ${draft.length > MAX_DRAFT_CHARS ? 'over-limit' : ''}`}
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type or dictate your unvarnished message here (e.g. 'Server went down, it's Raj's fault, fix by Friday.')..."
              />

              {/* Dictation Interim Floating Banner */}
              {speechInput.listening && (
                <div
                  className="inset banner banner-green"
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span className="mic-live" style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                  <span className="tiny" style={{ flex: 1 }}>
                    <strong>Listening...</strong> {speechInput.interim || 'Speak now into your microphone...'}
                  </span>
                  <button type="button" className="btn btn-icon" onClick={speechInput.stop} title="Stop voice recording">
                    <Square size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Presets Quick Pick Carousel */}
            <div>
              <span className="field-label">Try Quick Scenario Presets</span>
              <div className="row" style={{ gap: 8 }}>
                {PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft(item.draft);
                      handleTransform(item.draft);
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery Channel, Length, Language & Sliders Controls */}
            <div className="row-between" style={{ gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <div className="row" style={{ gap: 10 }}>
                {/* Channel */}
                <div>
                  <span className="tiny subtle" style={{ display: 'block', marginBottom: 2 }}>Channel</span>
                  <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ padding: '6px 10px' }}>
                    {CHANNELS.map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Length */}
                <div>
                  <span className="tiny subtle" style={{ display: 'block', marginBottom: 2 }}>Length</span>
                  <select className="input" value={length} onChange={(e) => setLength(e.target.value)} style={{ padding: '6px 10px' }}>
                    {LENGTHS.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Language */}
                <div>
                  <span className="tiny subtle" style={{ display: 'block', marginBottom: 2 }}>Language</span>
                  <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '6px 10px' }}>
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Privacy Mode Toggle */}
                <button
                  type="button"
                  className={`btn ${privacyMode ? 'btn-green-on' : ''}`}
                  onClick={() => setPrivacyMode(!privacyMode)}
                  title="Client-side redaction of emails, phones, and SSNs before sending to Gemini"
                  style={{ alignSelf: 'flex-end', height: 35 }}
                >
                  <Lock size={12} /> Privacy Guard: {privacyMode ? 'ON' : 'OFF'}
                </button>

                {/* Sliders Accordion Toggle */}
                <button
                  type="button"
                  className={`btn ${slidersOpen ? 'btn-on' : ''}`}
                  onClick={() => setSlidersOpen(!slidersOpen)}
                  title="Fine-tune formality, warmth, brevity, and directness"
                  style={{ alignSelf: 'flex-end', height: 35 }}
                >
                  <Sliders size={12} /> Tone Sliders {slidersOpen ? '▲' : '▼'}
                </button>
              </div>

              {/* Action Buttons: Mic + Transform */}
              <div className="row" style={{ gap: 10 }}>
                {speechInput.supported && (
                  <button
                    type="button"
                    className={`btn ${speechInput.listening ? 'btn-danger-on mic-live' : ''}`}
                    onClick={speechInput.listening ? speechInput.stop : speechInput.start}
                    title="Dictate with voice input (Web Speech API)"
                    style={{ height: 42, padding: '0 14px' }}
                  >
                    <Mic size={16} />
                    {speechInput.listening ? 'Recording...' : 'Dictate'}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleTransform()}
                  disabled={loading}
                  style={{ height: 42, padding: '0 24px' }}
                >
                  <Sparkles size={16} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'PrismTone is Processing...' : 'Transform Personas (Ctrl+Enter)'}
                </button>
              </div>
            </div>

            {/* Sliders Expansion Drawer */}
            {slidersOpen && (
              <div className="inset stack" style={{ gap: 12, padding: 14 }}>
                <div className="row-between">
                  <span className="tiny muted" style={{ fontWeight: 700 }}>5-Axis Tone Fine Tuning (1–10)</span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => setSliders(DEFAULT_SLIDERS)}
                  >
                    Reset Defaults
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  {SLIDERS.map((s) => (
                    <div key={s.key}>
                      <div className="row-between tiny subtle" style={{ marginBottom: 4 }}>
                        <span>{s.label}</span>
                        <strong className="mono" style={{ color: '#818cf8' }}>{sliders[s.key]}</strong>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={sliders[s.key]}
                        onChange={(e) => setSliders({ ...sliders, [s.key]: Number(e.target.value) })}
                      />
                      <div className="row-between tiny subtle" style={{ fontSize: 9 }}>
                        <span>{s.min}</span>
                        <span>{s.max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Cards Grid */}
          <main>
            {loading && !results && (
              <div className="grid-cards">
                <PersonaCardSkeleton />
                <PersonaCardSkeleton />
                <PersonaCardSkeleton />
                <PersonaCardSkeleton />
              </div>
            )}

            {results && results.results && (
              <div className="grid-cards">
                {Object.values(results.results).map((item) => (
                  <PersonaCard
                    key={item.persona_id}
                    item={item}
                    color={personaColor(registry, item.persona_id)}
                    viewMode={viewModes[item.persona_id] || 'clean'}
                    factsOpen={expandedFacts[item.persona_id] || false}
                    busy={regeneratingId === item.persona_id}
                    copied={copiedId === item.persona_id}
                    speaking={speaker.speakingId === item.persona_id}
                    canSpeak={speaker.supported}
                    onViewMode={(mode) => setViewModes((prev) => ({ ...prev, [item.persona_id]: mode }))}
                    onToggleFacts={() => setExpandedFacts((prev) => ({ ...prev, [item.persona_id]: !prev[item.persona_id] }))}
                    onCopy={() => handleCopyCard(item.persona_id, item.rewrite)}
                    onSpeak={() => speaker.toggle(item.persona_id, item.rewrite)}
                    onRegenerate={() => handleRegenerateSingle(item.persona_id)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: VISUAL RADAR & TONE SHIFT (STEP 1)                      */}
      {/* ============================================================== */}
      {activeTab === 'insights' && (
        <div>
          {results ? (
            <InsightsPanel
              result={results}
              registry={registry}
              target={slidersOpen ? slidersToTarget(sliders) : null}
            />
          ) : (
            <div className="panel empty-state">
              Run a transformation first to visualize the Tone Radar and Shift Spectrum.
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: DUAL COMPARE MODE (STEP 2)                              */}
      {/* ============================================================== */}
      {activeTab === 'compare' && (
        <div>
          {results ? (
            <CompareView
              result={results}
              registry={registry}
              onToast={notify}
            />
          ) : (
            <div className="panel empty-state">
              Run a transformation first to compare personas side-by-side.
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: TONE DECODER (REVERSE MODE)                             */}
      {/* ============================================================== */}
      {activeTab === 'decoder' && (
        <div className="stack">
          <section className="panel stack" style={{ gap: 16 }}>
            <div className="row-between">
              <div>
                <h3 className="panel-title">
                  <Search size={18} color="#818cf8" /> Tone Decoder &amp; Subtext Analyzer (Reverse Mode)
                </h3>
                <p className="tiny subtle" style={{ marginTop: 2 }}>
                  Paste any ambiguous email or chat message to reveal hidden subtext, risks, and tactical response strategies.
                </p>
              </div>

              {/* Decoder Presets */}
              <div className="row" style={{ gap: 6 }}>
                {DECODER_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setDecoderInput(preset);
                      handleDecode(preset);
                    }}
                  >
                    Sample {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className="textarea"
              rows={3}
              value={decoderInput}
              onChange={(e) => setDecoderInput(e.target.value)}
              placeholder="Paste ambiguous message here (e.g. 'Per my last email, please fix this ASAP or I will escalate to the VP.')..."
            />

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleDecode()}
                disabled={decoderLoading}
              >
                <Search size={15} className={decoderLoading ? 'animate-spin' : ''} />
                {decoderLoading ? 'Analyzing Subtext...' : 'Decode Subtext & Strategies'}
              </button>
            </div>
          </section>

          {/* Decoder Results */}
          {decoderResult && (
            <div className="grid-2">
              {/* Meaning & Emotional Analysis */}
              <div className="panel stack" style={{ gap: 14 }}>
                <h3 className="panel-title" style={{ fontSize: 14 }}>
                  <ShieldCheck size={16} color="#10b981" /> Linguistic Breakdown
                </h3>

                <div className="inset">
                  <span className="tiny subtle" style={{ display: 'block', marginBottom: 2 }}>Surface Meaning</span>
                  <p style={{ fontSize: 13 }}>{decoderResult.surface_meaning}</p>
                </div>

                <div className="inset" style={{ borderColor: 'rgba(99, 102, 241, 0.4)' }}>
                  <span className="tiny" style={{ color: '#818cf8', fontWeight: 700, display: 'block', marginBottom: 2 }}>
                    🕵️ Actual Subtext &amp; True Intent
                  </span>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{decoderResult.subtext}</p>
                </div>

                <div className="row-between inset">
                  <div>
                    <span className="tiny subtle">Emotional Temperature</span>
                    <strong style={{ display: 'block', fontSize: 14, color: '#f59e0b' }}>
                      {decoderResult.emotional_temperature}
                    </strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="tiny subtle">Urgency Level</span>
                    <strong style={{ display: 'block', fontSize: 14, color: '#ec4899' }}>
                      {decoderResult.urgency_level}
                    </strong>
                  </div>
                </div>

                {decoderResult.hidden_motives && (
                  <div className="risk" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span><strong>Hidden Motive / Risk:</strong> {decoderResult.hidden_motives}</span>
                  </div>
                )}
              </div>

              {/* Ready-to-Send Tactical Replies */}
              <div className="panel stack" style={{ gap: 14 }}>
                <h3 className="panel-title" style={{ fontSize: 14 }}>
                  <Send size={16} color="#818cf8" /> Ready-to-Send Tactical Responses
                </h3>
                <p className="tiny subtle">Choose the posture that best fits your relationship with the sender:</p>

                {decoderResult.recommended_responses && decoderResult.recommended_responses.map((reply, i) => (
                  <div key={i} className="inset stack" style={{ gap: 6, position: 'relative' }}>
                    <div className="row-between">
                      <span className="badge badge-accent">{reply.strategy}</span>
                      <button
                        type="button"
                        className={`btn ${copiedReplyIdx === i ? 'btn-success' : ''}`}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => handleCopyReply(i, reply.text)}
                      >
                        {copiedReplyIdx === i ? <Check size={11} /> : <Copy size={11} />}
                        {copiedReplyIdx === i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.5 }}>"{reply.text}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: HISTORY & SAVED (STEP 3)                                */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <HistoryPanel
          history={history}
          onSelectEntry={(entry) => {
            setDraft(entry.draft);
            if (entry.result) setResults(entry.result);
            setActiveTab('generator');
            notify('Loaded transformation from history!', 'info');
          }}
          onToast={notify}
        />
      )}

      {/* Custom Persona Builder Modal (Step 5) */}
      <CustomPersonaModal
        isOpen={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        customPersonas={customPersonas}
        onSave={handleAddCustomPersona}
        onDelete={handleDeleteCustomPersona}
        onToast={notify}
      />

      {/* Toast Stack */}
      <ToastStack toasts={toasts} />
    </div>
  );
}

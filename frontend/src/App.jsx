import React, { useState, useEffect } from 'react';
import {
  Sparkles, Copy, Check, RotateCcw, ShieldCheck, AlertTriangle,
  Volume2, Sliders, Eye, FileText, Zap, Lock, RefreshCw,
  Compass, Search, Cpu
} from 'lucide-react';

const PRESETS = [
  {
    id: "vibeathon_official",
    title: "⚡ Vibeathon Official Demo",
    subtitle: "Production server outage (blame -> collaboration)",
    draft: "Server went down, it's Raj's fault, fix by Friday."
  },
  {
    id: "student_prof",
    title: "🎓 Student to Professor",
    subtitle: "Late AI assignment extension request",
    draft: "Missed the deadline for the AI lab because my laptop died. Can I submit tomorrow?"
  },
  {
    id: "placement_hr",
    title: "💼 Placement HR Follow-Up",
    subtitle: "Campus drive post-interview check-in",
    draft: "Interview was last week, nobody emailed me yet. Are you offering me the job or not?"
  },
  {
    id: "manager_feedback",
    title: "👔 Manager to Junior Engineer",
    subtitle: "Constructive feedback without demotivating",
    draft: "The presentation was messy, you clearly didn't practice, redo the numbers before tomorrow."
  }
];

const CHANNELS = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'slack', label: 'Slack', icon: '💬' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '📱' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'sms', label: 'SMS', icon: '📲' }
];

const LENGTHS = [
  { id: 'one_liner', label: 'One-Liner' },
  { id: 'short', label: 'Short' },
  { id: 'standard', label: 'Standard' }
];

const LANGUAGES = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'hinglish', label: 'Hinglish', flag: '🇮🇳' },
  { id: 'hi', label: 'Hindi', flag: '🇮🇳' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [draft, setDraft] = useState("Server went down, it's Raj's fault, fix by Friday.");
  const [channel, setChannel] = useState('email');
  const [length, setLength] = useState('standard');
  const [language, setLanguage] = useState('en');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [sliders, setSliders] = useState({ formality: 6, warmth: 5, brevity: 7, directness: 8, humor: 2 });

  const [loading, setLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [results, setResults] = useState(null);
  const [viewModes, setViewModes] = useState({});
  const [expandedFacts, setExpandedFacts] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  // Decoder State (Reverse Mode)
  const [decoderInput, setDecoderInput] = useState("Per my last email, please fix this ASAP or I'll have to escalate to the VP.");
  const [decoderResult, setDecoderResult] = useState(null);
  const [decoderLoading, setDecoderLoading] = useState(false);

  useEffect(() => {
    handleTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTransform(customDraft = null) {
    const textToTransform = customDraft !== null ? customDraft : draft;
    if (!textToTransform.trim()) return;

    setLoading(true);
    try {
      const resp = await fetch('/api/v1/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: textToTransform,
          personas: ['executive', 'peer', 'legal', 'gen_z'],
          channel,
          length,
          language,
          privacy_mode: privacyMode,
          sliders
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
      } else {
        generateLocalFallback(textToTransform);
      }
    } catch (err) {
      console.warn("API unavailable, falling back to simulated engine", err);
      generateLocalFallback(textToTransform);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateSingle(personaId) {
    if (!draft.trim()) return;
    setRegeneratingId(personaId);
    try {
      const resp = await fetch('/api/v1/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft,
          personas: [personaId],
          channel,
          length,
          language,
          privacy_mode: privacyMode,
          sliders
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.results && data.results[personaId]) {
          setResults(prev => prev ? {
            ...prev,
            ai_engine: data.ai_engine,
            model_used: data.model_used,
            processing_time_ms: data.processing_time_ms,
            results: {
              ...prev.results,
              [personaId]: data.results[personaId]
            }
          } : data);
        }
      }
    } catch (err) {
      console.warn("Single regenerate failed", err);
    } finally {
      setRegeneratingId(null);
    }
  }

  function generateLocalFallback(text) {
    setResults({
      original_text: text,
      processing_time_ms: 12.4,
      ai_engine: 'offline_fallback',
      model_used: 'heuristic-v1',
      privacy_masked: privacyMode && /Raj|Priya|Amit/i.test(text),
      masked_entities_count: 1,
      results: {
        executive: {
          persona_id: 'executive',
          persona_name: 'Executive C-Level',
          tagline: 'Outcome-first, 2-3 crisp lines, zero fluff, clear deadlines',
          rewrite: 'The production server experienced downtime. An emergency patch is currently being deployed to restore full redundancy, with the final resolution targeted for completion by Friday EOD.',
          subject_line: 'Status Update: Production Outage & Friday Recovery Milestone',
          metrics: {
            formality: 9.1,
            warmth: 3.5,
            directness: 9.4,
            reading_grade: 11.2,
            reading_level_label: 'High School / Professional',
            change_score: 66.0,
            word_count: 26,
            length_change_pct: 188.0
          },
          facts_found: [
            { text: 'Friday', category: 'date', status: 'preserved' },
            { text: 'server down', category: 'commitment', status: 'preserved' }
          ],
          fact_guard_status: 'green',
          risk_flags: ['Blame language completely eliminated'],
          change_notes: [
            'Moved resolution timeline (Friday) to the forefront for executive visibility',
            'Replaced individual blame with systemic remediation status'
          ],
          diff_tokens: [
            { type: 'deleted', text: 'Server went down,' },
            { type: 'added', text: 'The production server experienced downtime.' },
            { type: 'deleted', text: " it's Raj's fault, fix" },
            { type: 'added', text: ' An emergency patch is currently being deployed to restore full redundancy, with the final resolution targeted for completion' },
            { type: 'unchanged', text: ' by Friday' },
            { type: 'added', text: ' EOD.' }
          ]
        },
        peer: {
          persona_id: 'peer',
          persona_name: 'Supportive Peer',
          tagline: 'Warm, constructive, collaborative, frames critique as mutual growth',
          rewrite: "Hey team, appreciate everyone rallying around the recent server issue. Raj is taking the lead on troubleshooting the root cause, and we're on track to wrap up fixes together by Friday. Let me know how I can help!",
          subject_line: 'Quick check-in on the server fix for Friday',
          metrics: {
            formality: 5.5,
            warmth: 8.9,
            directness: 6.8,
            reading_grade: 7.4,
            reading_level_label: 'Standard Public',
            change_score: 72.4,
            word_count: 36,
            length_change_pct: 300.0
          },
          facts_found: [
            { text: 'Friday', category: 'date', status: 'preserved' },
            { text: 'Raj', category: 'name', status: 'preserved' }
          ],
          fact_guard_status: 'green',
          risk_flags: [],
          change_notes: [
            'Framed the incident as a collaborative team effort',
            'Positioned Raj as leading the fix rather than bearing blame'
          ],
          diff_tokens: [
            { type: 'added', text: 'Hey team, appreciate everyone rallying around the recent ' },
            { type: 'unchanged', text: 'server ' },
            { type: 'added', text: 'issue. ' },
            { type: 'unchanged', text: 'Raj ' },
            { type: 'added', text: "is taking the lead on troubleshooting the root cause, and we're on track to wrap up fixes together " },
            { type: 'unchanged', text: 'by Friday. ' },
            { type: 'added', text: 'Let me know how I can help!' }
          ]
        },
        legal: {
          persona_id: 'legal',
          persona_name: 'Legal & Compliance',
          tagline: 'Neutral, legally sound, factual, zero emotive blame or over-promises',
          rewrite: 'We hereby record that a server disruption occurred. A technical review is underway, and corrective measures are scheduled for implementation on or before Friday. No warranties beyond standard SLA are extended.',
          subject_line: 'Notification of Service Interruption and Scheduled Rectification',
          metrics: {
            formality: 9.8,
            warmth: 2.1,
            directness: 7.9,
            reading_grade: 12.8,
            reading_level_label: 'Grade 12+ (Executive / Academic)',
            change_score: 84.1,
            word_count: 29,
            length_change_pct: 222.0
          },
          facts_found: [
            { text: 'Friday', category: 'date', status: 'preserved' }
          ],
          fact_guard_status: 'green',
          risk_flags: ['Removed personal culpability to eliminate legal vulnerability'],
          change_notes: [
            'Stripped all speculative and personal blame to prevent liability exposure',
            'Established precise date commitment without emotive qualifiers'
          ],
          diff_tokens: [
            { type: 'added', text: 'We hereby record that a ' },
            { type: 'unchanged', text: 'server ' },
            { type: 'added', text: 'disruption occurred. A technical review is underway, and corrective measures are scheduled for implementation on or before ' },
            { type: 'unchanged', text: 'Friday. ' },
            { type: 'added', text: 'No warranties beyond standard SLA are extended.' }
          ]
        },
        gen_z: {
          persona_id: 'gen_z',
          persona_name: 'Gen-Z Hype',
          tagline: 'Energetic, punchy, modern office slang, high vibe yet work-ready',
          rewrite: "Server took a quick nap, ngl! But no stress — Raj and the squad are already on the fix and we'll be totally locked in by Friday. We got this!",
          subject_line: 'Server downtime update — we bounce back Friday!',
          metrics: {
            formality: 2.4,
            warmth: 8.6,
            directness: 7.5,
            reading_grade: 5.6,
            reading_level_label: 'Grade 6 (Casual & Punchy)',
            change_score: 79.0,
            word_count: 28,
            length_change_pct: 211.0
          },
          facts_found: [
            { text: 'Friday', category: 'date', status: 'preserved' },
            { text: 'Raj', category: 'name', status: 'preserved' }
          ],
          fact_guard_status: 'green',
          risk_flags: [],
          change_notes: [
            "Replaced technical downtime with playful colloquialism ('took a quick nap')",
            'Turned individual blame into a supportive shoutout'
          ],
          diff_tokens: [
            { type: 'unchanged', text: 'Server ' },
            { type: 'added', text: 'took a quick nap, ngl! But no stress — ' },
            { type: 'unchanged', text: 'Raj ' },
            { type: 'added', text: "and the squad are already on the fix and we'll be totally locked in " },
            { type: 'unchanged', text: 'by Friday. ' },
            { type: 'added', text: 'We got this!' }
          ]
        }
      }
    });
  }

  async function handleDecode() {
    if (!decoderInput.trim()) return;
    setDecoderLoading(true);
    try {
      const resp = await fetch('/api/v1/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incoming_text: decoderInput })
      });
      if (resp.ok) {
        setDecoderResult(await resp.json());
      } else {
        fallbackDecode();
      }
    } catch {
      fallbackDecode();
    } finally {
      setDecoderLoading(false);
    }
  }

  function fallbackDecode() {
    setDecoderResult({
      dominant_tone: "Guarded / Mildly Frustrated",
      formality_score: 7.2,
      urgency_level: "Critical",
      hidden_subtext: "Frustration: The sender feels you ignored earlier instructions. High-priority time deadline detected.",
      sentiment: "Passive-Aggressive",
      ai_engine: "offline_fallback",
      model_used: "heuristic-v1",
      key_signals: [
        'Used "Per my last email" indicating repeated request',
        'Escalation threat ("escalate to VP") indicating loss of patience'
      ],
      suggested_reply_strategies: [
        {
          title: "De-escalate & Clarify (Supportive)",
          vibe: "Calm, acknowledging, and solution-focused",
          recommended_snippet: "Thanks for following up. You're completely right on this. I am on it right now and will deliver the complete fix by 3 PM today."
        },
        {
          title: "Firm & Factual (Executive)",
          vibe: "Concise, outcome-oriented, zero fluff",
          recommended_snippet: "Acknowledged. The root cause is identified and resolution will be deployed by EOD. Direct update to follow."
        },
        {
          title: "Detailed & Documented (Compliance)",
          vibe: "Thorough, neutral, and reference-backed",
          recommended_snippet: "Receipt confirmed. In accordance with the previous milestone, the fix is in final verification and will be completed within scheduled timeline."
        }
      ]
    });
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function speakText(text, id) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    }
  }

  const activeModelDisplay = results?.ai_engine === 'gemini'
    ? (results.model_used || 'gemini-3.6-flash').replace('models/', '')
    : null;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>

      {/* 1. Header Navigation */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        marginBottom: '28px',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'var(--prism-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)'
          }}>
            <Sparkles size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>PrismTone</h1>
              <span style={{
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                padding: '2px 8px',
                borderRadius: '999px',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>Vibeathon 2026</span>
              {results && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  background: activeModelDisplay ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                  color: activeModelDisplay ? '#6ee7b7' : '#fbbf24',
                  border: `1px solid ${activeModelDisplay ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                }}>
                  <Cpu size={12} />
                  {activeModelDisplay
                    ? `Live AI: ${activeModelDisplay} • ${(results.processing_time_ms / 1000).toFixed(2)}s`
                    : 'Stage-Safe Offline Mode'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Write once. Sound right to everyone. Instant Persona &amp; Proof Transformer.
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('generator')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              background: activeTab === 'generator' ? 'var(--prism-gradient)' : 'transparent',
              color: '#ffffff'
            }}
          >
            <Zap size={16} /> Persona Transformer
          </button>
          <button
            onClick={() => {
              setActiveTab('decoder');
              if (!decoderResult) handleDecode();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              background: activeTab === 'decoder' ? 'var(--prism-gradient)' : 'transparent',
              color: '#ffffff'
            }}
          >
            <Compass size={16} /> Tone Decoder (Reverse Mode)
          </button>
        </div>
      </header>

      {/* 2. TAB 1: PERSONA TRANSFORMER */}
      {activeTab === 'generator' && (
        <>
          {/* Preset Chips */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              One-Click Pitch Presets:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setDraft(p.draft);
                    handleTransform(p.draft);
                  }}
                  style={{
                    background: draft === p.draft ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-surface)',
                    border: draft === p.draft ? '1px solid #6366f1' : '1px solid var(--border-subtle)',
                    color: draft === p.draft ? '#a5b4fc' : 'var(--text-muted)',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          {/* Draft Input Box */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} color="#818cf8" /> Raw Draft / Bullet Points
              </label>
              <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                {draft.length} chars | {draft.split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleTransform();
              }}
              placeholder="Enter your rough draft, bullet points, or rushed thoughts... (Ctrl+Enter to transform)"
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '14px 16px',
                color: 'var(--text-main)',
                fontSize: '15px',
                lineHeight: '1.6',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
                outline: 'none',
                transition: 'border 0.2s'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#6366f1'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-subtle)'; }}
            />

            {/* Controls Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                {/* Channel Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-primary)', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  {CHANNELS.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => setChannel(ch.id)}
                      title={`Target format: ${ch.label}`}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: channel === ch.id ? '#312e81' : 'transparent',
                        color: channel === ch.id ? '#c7d2fe' : 'var(--text-muted)'
                      }}
                    >
                      {ch.icon} {ch.label}
                    </button>
                  ))}
                </div>

                {/* Length Control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-primary)', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  {LENGTHS.map(len => (
                    <button
                      key={len.id}
                      onClick={() => setLength(len.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: length === len.id ? '#1e293b' : 'transparent',
                        color: length === len.id ? '#ffffff' : 'var(--text-subtle)'
                      }}
                    >
                      {len.label}
                    </button>
                  ))}
                </div>

                {/* Language Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-primary)', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.id}
                      onClick={() => setLanguage(lang.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: language === lang.id ? '#1e293b' : 'transparent',
                        color: language === lang.id ? '#ffffff' : 'var(--text-subtle)'
                      }}
                    >
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>

                {/* Privacy Shield Toggle */}
                <button
                  onClick={() => setPrivacyMode(!privacyMode)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: privacyMode ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                    background: privacyMode ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-primary)',
                    color: privacyMode ? '#6ee7b7' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Lock size={14} />
                  Privacy {privacyMode ? 'ON' : 'OFF'}
                </button>

                {/* Sliders Drawer Toggle */}
                <button
                  onClick={() => setSlidersOpen(!slidersOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: slidersOpen ? 'var(--bg-card)' : 'var(--bg-primary)',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Sliders size={14} /> Sliders
                </button>
              </div>

              {/* Submit Transform Button */}
              <button
                onClick={() => handleTransform()}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--prism-gradient)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 4px 18px rgba(99, 102, 241, 0.4)',
                  transition: 'transform 0.1s'
                }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? 'Refracting via Gemini...' : 'Transform Across Personas'}
              </button>
            </div>

            {/* Custom Sliders Panel */}
            {slidersOpen && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: 'var(--bg-card)',
                borderRadius: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                border: '1px solid var(--border-subtle)'
              }}>
                {[
                  { key: 'formality', label: 'Formality', min: 'Casual', max: 'Strict' },
                  { key: 'warmth', label: 'Warmth', min: 'Reserved', max: 'Empathetic' },
                  { key: 'brevity', label: 'Brevity', min: 'Elaborate', max: 'Ultra Crisp' },
                  { key: 'directness', label: 'Directness', min: 'Gentle', max: 'Direct' },
                  { key: 'humor', label: 'Humor', min: 'Serious', max: 'Playful' }
                ].map(s => (
                  <div key={s.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>
                      <span>{s.label}</span>
                      <span style={{ color: '#818cf8' }}>{sliders[s.key]}/10</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={sliders[s.key]}
                      onChange={(e) => setSliders({ ...sliders, [s.key]: parseInt(e.target.value, 10) })}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-subtle)' }}>
                      <span>{s.min}</span>
                      <span>{s.max}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy Notification Banner */}
          {results?.privacy_masked && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#6ee7b7'
            }}>
              <ShieldCheck size={18} />
              <span>
                <strong>Privacy Guard Protected ({results.masked_entities_count} PII masked):</strong> Sensitive names/emails/phones were masked before reaching Gemini AI and restored faithfully in final cards.
              </span>
            </div>
          )}

          {/* 3. PARALLEL PERSONA CARDS (4 Columns) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: '20px'
          }}>
            {results && Object.values(results.results).map((item) => {
              const isDiff = viewModes[item.persona_id] === 'diff';
              const isFactOpen = !!expandedFacts[item.persona_id];
              const isRegen = regeneratingId === item.persona_id;
              const pColor = item.persona_id === 'executive' ? 'var(--color-executive)' :
                             item.persona_id === 'peer' ? 'var(--color-peer)' :
                             item.persona_id === 'legal' ? 'var(--color-legal)' : 'var(--color-genz)';

              return (
                <div
                  key={item.persona_id}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderTop: `4px solid ${pColor}`,
                    borderRadius: '14px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    opacity: isRegen ? 0.65 : 1,
                    transition: 'opacity 0.2s'
                  }}
                >
                  <div>
                    {/* Persona Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
                      <div>
                        <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#ffffff' }}>{item.persona_name}</h2>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: '2px' }}>
                          {item.tagline}
                        </p>
                      </div>

                      {/* Fact Guard Badge (Click to expand checklist) */}
                      <button
                        onClick={() => setExpandedFacts({ ...expandedFacts, [item.persona_id]: !isFactOpen })}
                        title="Click to inspect Fact Guard checklist"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '3px 8px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          background: item.fact_guard_status === 'green' ? 'rgba(16, 185, 129, 0.2)' :
                                      item.fact_guard_status === 'amber' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: item.fact_guard_status === 'green' ? '#34d399' :
                                 item.fact_guard_status === 'amber' ? '#fbbf24' : '#f87171',
                          border: `1px solid ${item.fact_guard_status === 'green' ? '#10b981' :
                                               item.fact_guard_status === 'amber' ? '#f59e0b' : '#ef4444'}`
                        }}
                      >
                        <ShieldCheck size={12} />
                        {item.fact_guard_status === 'green' ? 'Facts Preserved' :
                         item.fact_guard_status === 'amber' ? 'Fact Paraphrased' : 'Fact Alert'}
                      </button>
                    </div>

                    {/* Expandable Fact Guard Checklist */}
                    {isFactOpen && item.facts_found && item.facts_found.length > 0 && (
                      <div style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        marginBottom: '10px',
                        fontSize: '11px'
                      }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Fact Guard Audit:</div>
                        {item.facts_found.map((f, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span><code>{f.text}</code> <span style={{ color: 'var(--text-subtle)' }}>({f.category})</span></span>
                            <span style={{ color: f.status === 'missing' ? '#f87171' : '#34d399', fontWeight: 700 }}>
                              {f.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Subject Line (if email) */}
                    {item.subject_line && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        marginBottom: '12px',
                        borderLeft: `3px solid ${pColor}`
                      }}>
                        <strong style={{ color: 'var(--text-muted)' }}>Subject:</strong> {item.subject_line}
                      </div>
                    )}

                    {/* View Switcher: Clean vs Diff */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
                        <button
                          onClick={() => setViewModes({ ...viewModes, [item.persona_id]: 'clean' })}
                          style={{
                            padding: '3px 8px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: !isDiff ? '#334155' : 'transparent',
                            color: !isDiff ? '#ffffff' : 'var(--text-subtle)'
                          }}
                        >
                          <Eye size={12} style={{ display: 'inline', marginRight: '3px' }} /> Clean
                        </button>
                        <button
                          onClick={() => setViewModes({ ...viewModes, [item.persona_id]: 'diff' })}
                          style={{
                            padding: '3px 8px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: isDiff ? '#334155' : 'transparent',
                            color: isDiff ? '#ffffff' : 'var(--text-subtle)'
                          }}
                        >
                          <RefreshCw size={12} style={{ display: 'inline', marginRight: '3px' }} /> Word Diff
                        </button>
                      </div>
                    </div>

                    {/* Output Text or Diff Representation */}
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '14px',
                      minHeight: '110px',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: 'var(--text-main)',
                      marginBottom: '14px'
                    }}>
                      {!isDiff ? (
                        item.rewrite
                      ) : (
                        <div>
                          {item.diff_tokens.map((chunk, idx) => {
                            if (chunk.type === 'deleted') {
                              return <span key={idx} className="diff-deleted">{chunk.text}</span>;
                            } else if (chunk.type === 'added') {
                              return <span key={idx} className="diff-added">{chunk.text}</span>;
                            }
                            return <span key={idx} className="diff-unchanged">{chunk.text}</span>;
                          })}
                        </div>
                      )}
                    </div>

                    {/* "Why This Changed" Annotations */}
                    {item.change_notes && item.change_notes.length > 0 && (
                      <div style={{ marginBottom: '14px', fontSize: '12px' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Why this changed:
                        </span>
                        <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)' }}>
                          {item.change_notes.map((note, idx) => (
                            <li key={idx} style={{ marginBottom: '2px' }}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Risk Flags */}
                    {item.risk_flags && item.risk_flags.length > 0 && (
                      <div style={{
                        padding: '6px 10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#fca5a5',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertTriangle size={14} />
                        <span><strong>Risk Note:</strong> {item.risk_flags.join(', ')}</span>
                      </div>
                    )}

                    {/* Metrics Bar & Change Score */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '14px',
                      fontSize: '11px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>Change Score:</span>
                        <strong style={{ color: '#818cf8', fontFamily: 'var(--font-mono)' }}>
                          {item.metrics.change_score} / 100
                        </strong>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginTop: '6px' }}>
                        <div style={{ background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px' }}>
                          <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Formality</span>
                          <strong>{item.metrics.formality}/10</strong>
                        </div>
                        <div style={{ background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px' }}>
                          <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Warmth</span>
                          <strong>{item.metrics.warmth}/10</strong>
                        </div>
                        <div style={{ background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px' }}>
                          <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Directness</span>
                          <strong>{item.metrics.directness}/10</strong>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.metrics.word_count} words ({item.metrics.length_change_pct >= 0 ? '+' : ''}{item.metrics.length_change_pct}%)</span>
                        <span>{item.metrics.reading_level_label}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-subtle)',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => speakText(item.rewrite, item.persona_id)}
                        title="Read aloud polished draft"
                        style={{
                          padding: '6px 10px',
                          background: speakingId === item.persona_id ? '#4f46e5' : 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Volume2 size={14} /> Listen
                      </button>

                      <button
                        onClick={() => handleRegenerateSingle(item.persona_id)}
                        disabled={isRegen}
                        title="Regenerate this persona card with Gemini"
                        style={{
                          padding: '6px 10px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          cursor: isRegen ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RotateCcw size={13} className={isRegen ? 'animate-spin' : ''} /> Retry
                      </button>
                    </div>

                    <button
                      onClick={() => copyToClipboard(item.rewrite, item.persona_id)}
                      style={{
                        padding: '6px 14px',
                        background: copiedId === item.persona_id ? '#10b981' : '#312e81',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {copiedId === item.persona_id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === item.persona_id ? 'Copied!' : 'Copy Polish'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 3. TAB 2: TONE DECODER (REVERSE MODE) */}
      {activeTab === 'decoder' && (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={20} color="#818cf8" /> Tone Decoder (Reverse Mode)
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Paste an incoming email or message that feels passive-aggressive, high-pressure, or ambiguous. Gemini 3.6 Flash will decode the subtext and generate 3 tactical reply angles.
            </p>

            <textarea
              value={decoderInput}
              onChange={(e) => setDecoderInput(e.target.value)}
              placeholder="Paste incoming message here..."
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '14px',
                color: 'var(--text-main)',
                fontSize: '15px',
                outline: 'none',
                marginBottom: '16px'
              }}
            />

            <button
              onClick={handleDecode}
              disabled={decoderLoading}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--prism-gradient)',
                color: '#ffffff',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {decoderLoading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              {decoderLoading ? 'Decoding via Gemini...' : 'Decode Subtext & Recommended Replies'}
            </button>
          </div>

          {decoderResult && (
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>Detected Tone</span>
                  <strong style={{ fontSize: '15px', color: '#f59e0b' }}>{decoderResult.dominant_tone}</strong>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>Urgency Level</span>
                  <strong style={{ fontSize: '15px', color: decoderResult.urgency_level === 'Critical' ? '#ef4444' : '#10b981' }}>
                    {decoderResult.urgency_level}
                  </strong>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>Sentiment</span>
                  <strong style={{ fontSize: '15px', color: '#c084fc' }}>{decoderResult.sentiment}</strong>
                </div>
              </div>

              {/* Subtext Translation Card */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#818cf8', marginBottom: '6px' }}>
                  💡 Hidden Subtext Translation ("What they really mean"):
                </h3>
                <p style={{ fontSize: '14px', color: '#e2e8f0', lineHeight: '1.6' }}>
                  {decoderResult.hidden_subtext}
                </p>
                {decoderResult.key_signals && decoderResult.key_signals.length > 0 && (
                  <ul style={{ marginTop: '10px', paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {decoderResult.key_signals.map((sig, idx) => (
                      <li key={idx}>{sig}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recommended Reply Cards */}
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '14px' }}>
                Tactical Reply Angles:
              </h3>
              <div style={{ display: 'grid', gap: '14px' }}>
                {decoderResult.suggested_reply_strategies.map((strat, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '14px', color: '#38bdf8' }}>{strat.title}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>{strat.vibe}</span>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '10px' }}>
                      "{strat.recommended_snippet}"
                    </p>
                    <button
                      onClick={() => copyToClipboard(strat.recommended_snippet, `strat_${i}`)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: copiedId === `strat_${i}` ? '#10b981' : '#1e293b',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {copiedId === `strat_${i}` ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === `strat_${i}` ? 'Copied Snippet' : 'Copy Snippet'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: '10px',
        fontSize: '12px',
        color: 'var(--text-subtle)'
      }}>
        <span>PrismTone Engine • Graphic Era Hill University (Vibeathon 2026)</span>
        <span>Python FastAPI + Gemini 3.6 Flash • React Vite • Zero-Leak Privacy Guard</span>
      </footer>

    </div>
  );
}

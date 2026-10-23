/**
 * Shared constants for the PrismTone UI.
 */

export const BUILT_IN_PERSONAS = [
  { id: 'executive', name: 'Executive C-Level', color: '#3b82f6' },
  { id: 'peer', name: 'Supportive Peer', color: '#10b981' },
  { id: 'legal', name: 'Legal & Compliance', color: '#f59e0b' },
  { id: 'gen_z', name: 'Gen-Z Hype', color: '#ec4899' },
];

// Colors assigned to user-created personas, in order.
export const CUSTOM_COLORS = ['#a855f7', '#06b6d4', '#84cc16', '#f97316'];

export const ORIGINAL_COLOR = '#e2e8f0';

export const PRESETS = [
  { id: 'vibeathon_official', title: '⚡ Vibeathon Official Demo', draft: "Server went down, it's Raj's fault, fix by Friday." },
  { id: 'student_prof', title: '🎓 Professor Extension Request', draft: 'Missed the deadline for the AI lab because my laptop died. Can I submit tomorrow?' },
  { id: 'placement_hr', title: '💼 Placement Drive Follow-Up', draft: 'Interview was last week, nobody emailed me yet. Are you offering me the job or not?' },
  { id: 'club_announcement', title: '📣 College Club Announcement', draft: 'Coding club meetup on Saturday 4pm in Lab 3. Bring laptops. Pizza for first 30 people.' },
  { id: 'manager_feedback', title: '👔 Manager Feedback', draft: "The presentation was messy, you clearly didn't practice, redo the numbers before tomorrow." },
];

export const DECODER_PRESETS = [
  "Per my last email, please fix this ASAP or I'll have to escalate to the VP.",
  'Just following up again — any update on the report? The client is asking.',
  'Great work on the launch yesterday! Could we sync briefly on next steps whenever you are free?',
];

export const CHANNELS = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'slack', label: 'Slack', icon: '💬' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '📱' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'sms', label: 'SMS', icon: '📲' },
];

export const LENGTHS = [
  { id: 'one_liner', label: 'One-Liner' },
  { id: 'short', label: 'Short' },
  { id: 'standard', label: 'Standard' },
];

export const LANGUAGES = [
  { id: 'en', label: 'English', speech: 'en-IN' },
  { id: 'hinglish', label: 'Hinglish', speech: 'en-IN' },
  { id: 'hi', label: 'Hindi', speech: 'hi-IN' },
];

export const SLIDERS = [
  { key: 'formality', label: 'Formality', min: 'Casual', max: 'Strict' },
  { key: 'warmth', label: 'Warmth', min: 'Reserved', max: 'Empathetic' },
  { key: 'brevity', label: 'Brevity', min: 'Elaborate', max: 'Ultra Crisp' },
  { key: 'directness', label: 'Directness', min: 'Gentle', max: 'Direct' },
  { key: 'humor', label: 'Humor', min: 'Serious', max: 'Playful' },
];

export const DEFAULT_SLIDERS = { formality: 6, warmth: 5, brevity: 7, directness: 8, humor: 2 };

// Radar chart axes. Keys map to metrics returned by the backend (all on a 1-10 scale).
export const RADAR_AXES = [
  { key: 'formality', label: 'Formality' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'brevity', label: 'Brevity' },
  { key: 'directness', label: 'Directness' },
  { key: 'readability', label: 'Readability' },
];

export const MAX_DRAFT_CHARS = 5000;
export const MAX_ACTIVE_PERSONAS = 6;

export const DEMO_DRAFT = PRESETS[0].draft;

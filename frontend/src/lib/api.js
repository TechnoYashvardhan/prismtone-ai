/**
 * Thin API client for the PrismTone FastAPI backend.
 * Every call has a timeout and surfaces a readable error message.
 */

const REQUEST_TIMEOUT_MS = 30000;

function resolveApiBase() {
  let base = (import.meta.env.VITE_API_BASE_URL || '').trim();

  // Auto-heal common typo: prismtone-api.onrender.com -> prismtone-ai.onrender.com
  if (base.includes('prismtone-api.onrender.com')) {
    base = base.replace('prismtone-api.onrender.com', 'prismtone-ai.onrender.com');
  }

  // If deployed on Vercel without an env var, default to the production Render backend
  if (!base && typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    base = 'https://prismtone-ai.onrender.com';
  }

  return base.replace(/\/$/, '');
}

const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

function describeValidationError(detail) {
  if (!Array.isArray(detail) || !detail.length) return null;
  const first = detail[0];
  return first?.msg ? first.msg.replace(/^Value error, /, '') : null;
}

async function request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const resp = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!resp.ok) {
      let message = `Request failed (HTTP ${resp.status})`;
      try {
        const data = await resp.json();
        message = describeValidationError(data.detail) || (typeof data.detail === 'string' ? data.detail : message);
      } catch {
        /* response had no JSON body */
      }
      // 502/503/504 from the Vite proxy mean the backend process is down.
      throw new ApiError(message, { status: resp.status, offline: resp.status >= 502 });
    }
    return await resp.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError('The request timed out. Please try again.', { offline: true });
    throw new ApiError('Cannot reach the PrismTone server.', { offline: true });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request('/health'),
  transform: (payload) => request('/api/v1/transform', { method: 'POST', body: payload }),
  diff: (text1, text2) => request('/api/v1/diff', { method: 'POST', body: { text1, text2 } }),
  decode: (incomingText) => request('/api/v1/decode', { method: 'POST', body: { incoming_text: incomingText } }),
};

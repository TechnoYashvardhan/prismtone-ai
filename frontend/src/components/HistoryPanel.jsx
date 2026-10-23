import React, { useState } from 'react';
import { History, Star, Trash2, Download, Printer, ArrowUpRight, Copy, Check } from 'lucide-react';
import { buildMarkdownReport, downloadTextFile, printReport, copyText } from '../lib/export';

export default function HistoryPanel({ history, onSelectEntry, onToast }) {
  const [filterStarred, setFilterStarred] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const entries = filterStarred ? history.items.filter(i => i.starred) : history.items;

  const handleExportMarkdown = (entry) => {
    const md = buildMarkdownReport(entry.result);
    const dateStr = new Date(entry.createdAt).toISOString().slice(0, 10);
    downloadTextFile(`prismtone-report-${dateStr}.md`, md);
    onToast?.('Downloaded Markdown report!', 'success');
  };

  const handleCopyMarkdown = async (entry, id) => {
    const md = buildMarkdownReport(entry.result);
    const ok = await copyText(md);
    if (ok) {
      setCopiedId(id);
      onToast?.('Copied full Markdown report!', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="panel stack">
      <div className="row-between">
        <div>
          <h3 className="panel-title"><History size={18} color="#818cf8" /> Transformation History</h3>
          <p className="tiny subtle" style={{ marginTop: 2 }}>
            Saved locally in browser storage • Starred items are preserved
          </p>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className={`btn ${filterStarred ? 'btn-on' : ''}`}
            onClick={() => setFilterStarred(!filterStarred)}
          >
            <Star size={13} fill={filterStarred ? '#fbbf24' : 'none'} color={filterStarred ? '#fbbf24' : 'currentColor'} />
            {filterStarred ? 'Starred Only' : 'Show All'}
          </button>

          {history.items.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={history.clearUnstarred}
              title="Remove unstarred entries"
            >
              <Trash2 size={13} /> Clear Unstarred
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          {filterStarred ? 'No starred transformations yet.' : 'No transformations saved yet. Run a draft to see history!'}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {entries.map(entry => {
            const date = new Date(entry.createdAt);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString();
            const personCount = Object.keys(entry.result?.results || {}).length;

            return (
              <div key={entry.id} className="history-item">
                <div className="row-between">
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-icon"
                      style={{ border: 'none', background: 'transparent', padding: 2 }}
                      onClick={() => history.toggleStar(entry.id)}
                      title="Star this transformation"
                    >
                      <Star
                        size={15}
                        fill={entry.starred ? '#fbbf24' : 'none'}
                        color={entry.starred ? '#fbbf24' : 'var(--text-subtle)'}
                      />
                    </button>
                    <span className="tiny subtle">{dateStr} at {timeStr}</span>
                    <span className="badge badge-accent tiny">{personCount} personas</span>
                    <span className="tiny subtle">{entry.channel || 'email'} • {entry.language || 'en'}</span>
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onSelectEntry(entry)}
                      title="Restore draft into editor"
                    >
                      <ArrowUpRight size={13} /> Load
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleCopyMarkdown(entry, entry.id)}
                      title="Copy report markdown"
                    >
                      {copiedId === entry.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleExportMarkdown(entry)}
                      title="Export Markdown report"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={() => history.remove(entry.id)}
                      title="Delete entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="small" style={{ color: 'var(--text-main)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  "{entry.draft}"
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

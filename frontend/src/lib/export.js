/**
 * Export helpers: Markdown report download, clipboard copy, and print-to-PDF.
 */

export function buildMarkdownReport(result) {
  const lines = [
    '# PrismTone Report',
    '',
    `_Generated ${new Date().toLocaleString()} • Engine: ${result.model_used}_`,
    '',
    '## Original Draft',
    '',
    `> ${result.original_text.replace(/\n/g, '\n> ')}`,
    '',
  ];

  Object.values(result.results).forEach((card) => {
    const m = card.metrics;
    lines.push(`## ${card.persona_name}`, '');
    if (card.subject_line) lines.push(`**Subject:** ${card.subject_line}`, '');
    lines.push(card.rewrite, '');
    lines.push(
      `| Change Score | Formality | Warmth | Directness | Brevity | Readability | Fact Guard |`,
      `|---|---|---|---|---|---|---|`,
      `| ${m.change_score}/100 | ${m.formality} | ${m.warmth} | ${m.directness} | ${m.brevity} | ${m.readability} | ${card.fact_guard_status} |`,
      '',
    );
    if (card.change_notes?.length) {
      lines.push('**Why this changed:**', ...card.change_notes.map((n) => `- ${n}`), '');
    }
    if (card.risk_flags?.length) {
      lines.push('**Risk notes:**', ...card.risk_flags.map((r) => `- ${r}`), '');
    }
  });

  return lines.join('\n');
}

export function downloadTextFile(filename, content, mime = 'text/markdown') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function printReport() {
  window.print();
}

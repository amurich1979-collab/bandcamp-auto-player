const statusElement = document.getElementById('status');
const controls = [...document.querySelectorAll('button[data-action]')];
const historyElement = document.getElementById('history');
const delayInput = document.getElementById('delaySeconds');
const historyPanel = document.getElementById('historyPanel');
const toggleHistoryButton = document.getElementById('toggleHistory');

function setStatus(text, isError = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('error', isError);
  statusElement.classList.toggle('empty', !text);
}

async function sendAction(action, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  const response = await chrome.tabs.sendMessage(tab.id, { action, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Extension did not respond');
  return response;
}

function renderStatus(status) {
  if (!status) return;
  delayInput.value = String(status.delayMs / 1000);
  setStatus(status.track
    ? `${status.isPlaying ? 'Playing' : 'Stopped'}: ${status.track}`
    : (status.trackCount ? 'Ready to play' : 'No releases found on this page'));
}

function renderHistory(history) {
  historyElement.replaceChildren();
  if (!history.length) {
    historyElement.textContent = 'No listening history yet.';
    return;
  }
  for (const item of history) {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `${item.title} — ${item.artist}`;
    const outcome = document.createElement('span');
    outcome.className = `outcome ${item.outcome}`;
    outcome.textContent = item.outcome === 'completed' ? 'Played' : item.outcome === 'skipped' ? 'Skipped' : 'In progress';
    const time = document.createElement('time');
    time.dateTime = item.startedAt;
    time.textContent = new Date(item.startedAt).toLocaleString();
    row.append(link, outcome, document.createTextNode(' · '), time);
    historyElement.append(row);
  }
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportHistory(history) {
  const rows = [
    ['Title', 'Artist', 'Bandcamp link'],
    ...history.map((item) => [item.title, item.artist, item.url])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bandcamp-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function refresh() {
  const [statusResponse, historyResponse] = await Promise.all([sendAction('status'), sendAction('history')]);
  renderStatus(statusResponse.status);
  renderHistory(historyResponse.result || []);
}

async function runAction(action) {
  controls.forEach((button) => { button.disabled = true; });
  try {
    const response = await sendAction(action);
    renderStatus(response.status);
    if (action !== 'status') await refresh();
  } catch (error) {
    setStatus('');
  } finally {
    controls.forEach((button) => { button.disabled = false; });
  }
}

controls.forEach((button) => button.addEventListener('click', () => void runAction(button.dataset.action)));
document.getElementById('saveSettings').addEventListener('click', async () => {
  try {
    const response = await sendAction('saveSettings', { delaySeconds: delayInput.value });
    renderStatus(response.status);
  } catch { setStatus(''); }
});
document.getElementById('clearHistory').addEventListener('click', async () => {
  try { await sendAction('clearHistory'); await refresh(); } catch { setStatus('Could not clear history.', true); }
});
document.getElementById('exportHistory').addEventListener('click', async () => {
  try {
    const response = await sendAction('history');
    exportHistory(response.result || []);
  } catch { setStatus('Could not export history.', true); }
});
toggleHistoryButton.addEventListener('click', () => {
  const isOpen = historyPanel.classList.toggle('open');
  toggleHistoryButton.textContent = isOpen ? 'Hide history' : 'View history';
});

void refresh().catch(() => setStatus(''));

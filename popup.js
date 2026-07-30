const controls = [...document.querySelectorAll('button[data-action]')];

async function runAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { action });
}

controls.forEach((button) => {
  button.addEventListener('click', () => void runAction(button.dataset.action));
});

const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const historyButton = document.getElementById('toggleHistory');
const exportButton = document.getElementById('exportHistory');

function historyLabel(item) {
  if (item.outcome === 'completed') return 'Played';
  if (item.outcome === 'skipped') return 'Skipped';
  if (item.outcome === 'partial') return 'Partly played';
  return 'Playing';
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  historyList.replaceChildren();
  if (!history.length) {
    historyList.textContent = 'No history yet.';
    return;
  }
  for (const item of history) {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.textContent = `${item.title} — ${item.artist}`;
    const details = document.createElement('small');
    const metadata = [item.genre, ...(item.tags || [])].filter(Boolean).join(', ');
    details.textContent = `${item.liked ? '♥ ' : ''}${historyLabel(item)}${metadata ? ` · ${metadata}` : ''}`;
    row.append(link, details);
    historyList.append(row);
  }
}

historyButton.addEventListener('click', async () => {
  const opened = historyPanel.classList.toggle('open');
  historyButton.textContent = opened ? 'Hide history' : 'View history';
  if (opened) await renderHistory();
});

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

exportButton.addEventListener('click', async () => {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  const rows = [
    ['Title', 'Artist', 'Bandcamp link', 'Genre', 'Tags', 'Liked', 'Status'],
    ...history.map((item) => [item.title, item.artist, item.url, item.genre, (item.tags || []).join(', '), item.liked ? 'Yes' : 'No', historyLabel(item)])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bandcamp-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

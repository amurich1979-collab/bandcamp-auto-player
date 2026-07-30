(() => {
  'use strict';
  const QUICK_SKIP_MS = 5000;
  const HISTORY_LIMIT = 100;
  let active = null;

  function getTrack(card) {
    const link = card.querySelector('.meta a[href]');
    const tags = [...card.querySelectorAll('.tag, [data-testid*="tag"], [class*="tag"]')]
      .map((item) => item.textContent.trim()).filter(Boolean);
    return {
      title: card.querySelector('.meta strong')?.textContent.trim() || 'Untitled',
      artist: card.querySelector('.meta span')?.textContent.trim() || 'Unknown artist',
      url: link?.href || location.href,
      genre: card.querySelector('.meta .genre')?.textContent.trim() || '',
      tags: [...new Set(tags)]
    };
  }

  function parseTime(value) {
    const [minutes, seconds] = value.split(':').map(Number);
    return minutes * 60 + seconds;
  }

  async function changeHistory(change) {
    const { history = [] } = await chrome.storage.local.get({ history: [] });
    await chrome.storage.local.set({ history: change(history).slice(0, HISTORY_LIMIT) });
  }

  async function finish(outcome) {
    if (!active) return;
    const id = active.id;
    active = null;
    await changeHistory((history) => history.map((item) => item.id === id
      ? { ...item, outcome, finishedAt: new Date().toISOString() }
      : item));
  }

  async function start(track) {
    if (active?.url === track.url) return;
    if (active) await finish(Date.now() - active.startedAt <= QUICK_SKIP_MS ? 'skipped' : 'partial');
    const item = { id: crypto.randomUUID(), ...track, startedAt: new Date().toISOString(), outcome: 'in_progress', liked: false };
    await changeHistory((history) => [item, ...history]);
    active = { id: item.id, url: item.url, startedAt: Date.now() };
  }

  async function markLiked(card) {
    if (!card) return;
    const { url } = getTrack(card);
    await changeHistory((history) => history.map((item) => item.url === url ? { ...item, liked: true } : item));
  }

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.results-grid-item');
    if (card && event.target.closest('.play-pause-button.play-button')) void start(getTrack(card));
    const control = event.target.closest('button, a');
    if (!control) return;
    const text = [control.getAttribute('aria-label'), control.getAttribute('title'), control.className, control.textContent]
      .filter(Boolean).join(' ').toLowerCase();
    if (/like|wishlist|favo(u)?rite|heart|love/.test(text) && !/unlike|remove/.test(text)) void markLiked(card);
  }, true);

  setInterval(() => {
    if (!active) return;
    const current = document.querySelector('.discover-player .playback-time.current')?.textContent.trim();
    const total = document.querySelector('.discover-player .playback-time.total')?.textContent.trim();
    if (current && total && parseTime(current) >= parseTime(total) - 1) void finish('completed');
  }, 1000);
})();

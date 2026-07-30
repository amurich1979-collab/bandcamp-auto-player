(() => {
  'use strict';

  const SELECTORS = {
    track: '.results-grid-item',
    title: '.meta strong',
    artist: '.meta span',
    releaseLink: '.meta a[href]',
    playButton: '.play-pause-button.play-button',
    viewMore: '#view-more',
    media: 'audio, video'
  };
  const WAIT_TIMEOUT_MS = 10000;
  const HISTORY_LIMIT = 100;

  let isPlaying = false;
  let currentTrackIndex = -1;
  let tracks = [];
  let operationId = 0;
  let activeMedia = null;
  let delayTimer = null;
  let programmaticClick = false;
  let activeHistoryId = null;
  let settings = { delayMs: 0 };

  const storageReady = chrome.storage.local.get({ settings }).then((data) => {
    settings = { ...settings, ...data.settings };
  });

  function getTracks() {
    return [...document.querySelectorAll(SELECTORS.track)].map((element) => {
      const link = element.querySelector(SELECTORS.releaseLink);
      return {
        element,
        playButton: element.querySelector(SELECTORS.playButton),
        title: element.querySelector(SELECTORS.title)?.textContent.trim() || 'Untitled',
        artist: element.querySelector(SELECTORS.artist)?.textContent.trim() || 'Unknown artist',
        url: link?.href || location.href
      };
    }).filter((track) => track.playButton);
  }

  function refreshTracks() {
    tracks = getTracks();
    return tracks;
  }

  function waitFor(predicate, timeoutMs = WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const initialValue = predicate();
      if (initialValue) return resolve(initialValue);

      const observer = new MutationObserver(() => {
        const value = predicate();
        if (!value) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(value);
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Bandcamp elements did not appear in time'));
      }, timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function clearScheduledNext() {
    if (delayTimer) clearTimeout(delayTimer);
    delayTimer = null;
  }

  async function addHistory(track) {
    const item = {
      id: crypto.randomUUID(),
      title: track.title,
      artist: track.artist,
      url: track.url,
      startedAt: new Date().toISOString(),
      outcome: 'in_progress'
    };
    const { history = [] } = await chrome.storage.local.get({ history: [] });
    await chrome.storage.local.set({ history: [item, ...history].slice(0, HISTORY_LIMIT) });
    activeHistoryId = item.id;
  }

  async function finishHistory(outcome) {
    if (!activeHistoryId) return;
    const id = activeHistoryId;
    activeHistoryId = null;
    const { history = [] } = await chrome.storage.local.get({ history: [] });
    await chrome.storage.local.set({
      history: history.map((item) => item.id === id
        ? { ...item, outcome, finishedAt: new Date().toISOString() }
        : item)
    });
  }

  function detachMediaListener() {
    if (!activeMedia) return;
    activeMedia.removeEventListener('ended', handleTrackEnded);
    activeMedia = null;
  }

  async function handleTrackEnded() {
    if (!isPlaying) return;
    await finishHistory('completed');
    clearScheduledNext();
    delayTimer = setTimeout(() => {
      delayTimer = null;
      void playNextTrack();
    }, settings.delayMs);
  }

  async function attachMediaListener(expectedOperationId) {
    try {
      const media = await waitFor(() => [...document.querySelectorAll(SELECTORS.media)]
        .find((item) => !item.paused && !item.ended));
      if (!isPlaying || expectedOperationId !== operationId) return;
      detachMediaListener();
      activeMedia = media;
      activeMedia.addEventListener('ended', handleTrackEnded, { once: true });
    } catch (error) {
      console.warn('[Bandcamp Auto Player]', error.message);
    }
  }

  async function playTrack(index, { click = true } = {}) {
    refreshTracks();
    if (!isPlaying || index < 0 || index >= tracks.length) return false;
    clearScheduledNext();
    currentTrackIndex = index;
    const currentOperationId = ++operationId;
    const track = tracks[index];
    detachMediaListener();
    await addHistory(track);
    if (click) {
      programmaticClick = true;
      track.playButton.click();
      programmaticClick = false;
    }
    void attachMediaListener(currentOperationId);
    return true;
  }

  async function loadMoreTracks(previousCount) {
    const button = document.querySelector(SELECTORS.viewMore);
    if (!button || button.disabled) return false;
    button.click();
    try {
      await waitFor(() => getTracks().length > previousCount);
      refreshTracks();
      return true;
    } catch {
      return false;
    }
  }

  async function playNextTrack() {
    if (!isPlaying) return false;
    refreshTracks();
    const nextIndex = currentTrackIndex + 1;
    if (nextIndex < tracks.length) return playTrack(nextIndex);
    const previousCount = tracks.length;
    if (await loadMoreTracks(previousCount)) return playTrack(previousCount);
    return stopAutoPlay();
  }

  async function playPreviousTrack() {
    if (!isPlaying || currentTrackIndex <= 0) return false;
    await finishHistory('skipped');
    return playTrack(currentTrackIndex - 1);
  }

  async function startAutoPlay() {
    await storageReady;
    if (isPlaying) return getStatus();
    isPlaying = true;
    const startOperationId = ++operationId;
    try {
      await waitFor(() => getTracks().length > 0);
      if (!isPlaying || startOperationId !== operationId) return getStatus();
      refreshTracks();
      return playTrack(currentTrackIndex >= 0 ? currentTrackIndex : 0);
    } catch (error) {
      await stopAutoPlay();
      throw error;
    }
  }

  async function stopAutoPlay() {
    isPlaying = false;
    operationId += 1;
    clearScheduledNext();
    detachMediaListener();
    return getStatus();
  }

  async function toggleAutoPlay() {
    return isPlaying ? stopAutoPlay() : startAutoPlay();
  }

  async function startFromManualClick(index) {
    refreshTracks();
    if (index === currentTrackIndex && activeHistoryId) return;
    if (activeHistoryId) await finishHistory('skipped');
    isPlaying = true;
    await storageReady;
    await playTrack(index, { click: false });
  }

  function getStatus() {
    refreshTracks();
    const track = tracks[currentTrackIndex];
    return {
      isPlaying,
      currentTrackIndex,
      trackCount: tracks.length,
      delayMs: settings.delayMs,
      track: track ? `${track.title} — ${track.artist}` : null
    };
  }

  async function getHistory() {
    const { history = [] } = await chrome.storage.local.get({ history: [] });
    return history;
  }

  async function saveSettings({ delaySeconds }) {
    const seconds = Math.min(300, Math.max(0, Number(delaySeconds) || 0));
    settings.delayMs = Math.round(seconds * 1000);
    await chrome.storage.local.set({ settings });
    return getStatus();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest(SELECTORS.playButton);
    const card = button?.closest(SELECTORS.track);
    if (!card || programmaticClick) return;
    const index = refreshTracks().findIndex((track) => track.element === card);
    if (index >= 0) void startFromManualClick(index);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const actions = {
      start: startAutoPlay,
      stop: stopAutoPlay,
      toggle: toggleAutoPlay,
      previous: playPreviousTrack,
      next: async () => { await finishHistory('skipped'); return playNextTrack(); },
      status: getStatus,
      history: getHistory,
      clearHistory: async () => {
        activeHistoryId = null;
        return chrome.storage.local.set({ history: [] });
      },
      saveSettings: () => saveSettings(message)
    };
    const action = actions[message?.action];
    if (!action) {
      sendResponse({ ok: false, error: 'Unknown command' });
      return false;
    }
    Promise.resolve(action())
      .then((result) => sendResponse({ ok: true, status: getStatus(), result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();

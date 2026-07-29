(() => {
  'use strict';

  const SELECTORS = {
    track: '.results-grid-item',
    title: '.meta strong',
    artist: '.meta span',
    playButton: '.play-pause-button.play-button',
    viewMore: '#view-more',
    media: 'audio, video'
  };

  const WAIT_TIMEOUT_MS = 10000;

  let isPlaying = false;
  let currentTrackIndex = -1;
  let tracks = [];
  let operationId = 0;
  let activeMedia = null;

  function getTracks() {
    return [...document.querySelectorAll(SELECTORS.track)]
      .map((element) => ({
        element,
        playButton: element.querySelector(SELECTORS.playButton),
        title: element.querySelector(SELECTORS.title)?.textContent.trim() || 'Без названия',
        artist: element.querySelector(SELECTORS.artist)?.textContent.trim() || 'Неизвестный исполнитель'
      }))
      .filter((track) => track.playButton);
  }

  function refreshTracks() {
    tracks = getTracks();
    return tracks;
  }

  function waitFor(predicate, timeoutMs = WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const initialValue = predicate();
      if (initialValue) {
        resolve(initialValue);
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Превышено время ожидания элементов Bandcamp'));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const value = predicate();
        if (!value) return;

        clearTimeout(timeout);
        observer.disconnect();
        resolve(value);
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function detachMediaListener() {
    if (!activeMedia) return;
    activeMedia.removeEventListener('ended', handleTrackEnded);
    activeMedia = null;
  }

  function handleTrackEnded() {
    if (isPlaying) void playNextTrack();
  }

  async function attachMediaListener(expectedOperationId) {
    try {
      const media = await waitFor(() => {
        return [...document.querySelectorAll(SELECTORS.media)]
          .find((item) => !item.paused && !item.ended);
      });

      if (!isPlaying || expectedOperationId !== operationId) return;

      detachMediaListener();
      activeMedia = media;
      activeMedia.addEventListener('ended', handleTrackEnded, { once: true });
    } catch (error) {
      console.warn('[Bandcamp Auto Player]', error.message);
    }
  }

  async function playTrack(index) {
    refreshTracks();
    if (!isPlaying || index < 0 || index >= tracks.length) return false;

    currentTrackIndex = index;
    const currentOperationId = ++operationId;
    const track = tracks[index];

    detachMediaListener();
    track.playButton.click();
    void attachMediaListener(currentOperationId);
    console.info(`[Bandcamp Auto Player] ${index + 1}/${tracks.length}: ${track.title} — ${track.artist}`);
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
    } catch (error) {
      console.warn('[Bandcamp Auto Player] Новые треки не появились');
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

    stopAutoPlay();
    return false;
  }

  function playPreviousTrack() {
    if (!isPlaying || currentTrackIndex <= 0) return false;
    return playTrack(currentTrackIndex - 1);
  }

  async function startAutoPlay() {
    if (isPlaying) return getStatus();

    isPlaying = true;
    const startOperationId = ++operationId;

    try {
      await waitFor(() => getTracks().length > 0);
      if (!isPlaying || startOperationId !== operationId) return getStatus();

      refreshTracks();
      await playTrack(currentTrackIndex >= 0 && currentTrackIndex < tracks.length ? currentTrackIndex : 0);
    } catch (error) {
      stopAutoPlay();
      throw error;
    }

    return getStatus();
  }

  function stopAutoPlay() {
    isPlaying = false;
    operationId += 1;
    detachMediaListener();
    return getStatus();
  }

  function getStatus() {
    refreshTracks();
    const track = tracks[currentTrackIndex];
    return {
      isPlaying,
      currentTrackIndex,
      trackCount: tracks.length,
      track: track ? `${track.title} — ${track.artist}` : null
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const actions = {
      start: startAutoPlay,
      stop: stopAutoPlay,
      previous: playPreviousTrack,
      next: playNextTrack,
      status: getStatus
    };
    const action = actions[message?.action];

    if (!action) {
      sendResponse({ ok: false, error: 'Неизвестная команда' });
      return false;
    }

    Promise.resolve()
      .then(action)
      .then(() => sendResponse({ ok: true, status: getStatus() }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });

  console.info('[Bandcamp Auto Player] Готов к работе');
})();

(function () {
  'use strict';

  let isPlaying = false;
  let currentTrackIndex = 0;
  let trackList = [];

  const trackSelector = '.results-grid-item';
  const titleSelector = '.meta strong';
  const artistSelector = '.meta span';
  const playButtonSelector = '.g-button.play-pause-button.play-button';
  const viewMoreButtonSelector = '#view-more';
  const currentTimeSelector = '.discover-player .playback-time.current';
  const totalTimeSelector = '.discover-player .playback-time.total';

  function findTracks() {
    return Array.from(document.querySelectorAll(trackSelector)).map((track) => ({
      playButton: track.querySelector(playButtonSelector),
      title: track.querySelector(titleSelector)?.textContent.trim(),
      artist: track.querySelector(artistSelector)?.textContent.trim()
    })).filter((track) => track.playButton);
  }

  function updateTrackList() {
    trackList = findTracks();
  }

  function waitForTracks() {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const tracks = document.querySelectorAll(trackSelector);
        if (tracks.length > 0) {
          clearInterval(interval);
          resolve(tracks);
        }
      }, 500);
    });
  }

  function parseTime(timeString) {
    const [minutes, seconds] = timeString.split(':').map(Number);
    return minutes * 60 + seconds;
  }

  function checkTrackEnd() {
    const currentTimeElement = document.querySelector(currentTimeSelector);
    const totalTimeElement = document.querySelector(totalTimeSelector);

    if (!currentTimeElement || !totalTimeElement) {
      setTimeout(checkTrackEnd, 5000);
      return;
    }

    const currentTime = parseTime(currentTimeElement.textContent.trim());
    const totalTime = parseTime(totalTimeElement.textContent.trim());
    if (currentTime >= totalTime - 1) {
      setTimeout(playNextTrack, 5000);
    } else {
      setTimeout(checkTrackEnd, 1000);
    }
  }

  async function playTrack(index) {
    if (index < 0 || index >= trackList.length) return;
    currentTrackIndex = index;
    const track = trackList[currentTrackIndex];
    if (!track || !track.playButton) return;
    track.playButton.click();
    await waitForPlayer();
    checkTrackEnd();
  }

  function playNextTrack() {
    if (!isPlaying) return;
    const nextIndex = currentTrackIndex + 1;
    if (nextIndex < trackList.length) {
      playTrack(nextIndex);
    } else {
      loadMoreTracks().then(() => {
        updateTrackList();
        playTrack(0);
      });
    }
  }

  function playPreviousTrack() {
    if (!isPlaying) return;
    const previousIndex = currentTrackIndex - 1;
    if (previousIndex >= 0) playTrack(previousIndex);
  }

  function loadMoreTracks() {
    return new Promise((resolve) => {
      const moreButton = document.querySelector(viewMoreButtonSelector);
      if (moreButton) {
        moreButton.click();
        setTimeout(resolve, 3000);
      } else {
        resolve();
      }
    });
  }

  function waitForPlayer() {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const player = document.querySelector('.discover-player');
        if (player) {
          clearInterval(interval);
          resolve(player);
        }
      }, 500);
    });
  }

  async function startAutoPlay() {
    isPlaying = true;
    await waitForTracks();
    updateTrackList();
    setTimeout(() => playTrack(0), 1000);
  }

  function stopAutoPlay() {
    isPlaying = false;
  }

  window.startAutoPlay = startAutoPlay;
  window.stopAutoPlay = stopAutoPlay;
  window.playPreviousTrack = playPreviousTrack;
  window.playNextTrack = playNextTrack;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const actions = {
      start: startAutoPlay,
      stop: stopAutoPlay,
      previous: playPreviousTrack,
      next: playNextTrack
    };
    const action = actions[message?.action];
    if (!action) return false;
    Promise.resolve(action()).then(() => sendResponse({ ok: true }));
    return true;
  });
})();

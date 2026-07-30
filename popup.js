const controls = [...document.querySelectorAll('button[data-action]')];

function callPlayer(action) {
  const actions = {
    start: window.startAutoPlay,
    stop: window.stopAutoPlay,
    previous: window.playPreviousTrack,
    next: window.playNextTrack
  };
  return actions[action]?.();
}

async function runAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: callPlayer,
    args: [action]
  });
}

controls.forEach((button) => {
  button.addEventListener('click', () => void runAction(button.dataset.action));
});

const controls = [...document.querySelectorAll('button[data-action]')];

async function runAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { action });
}

controls.forEach((button) => {
  button.addEventListener('click', () => void runAction(button.dataset.action));
});

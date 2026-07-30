chrome.commands.onCommand.addListener(async (command) => {
  const actionByCommand = {
    'toggle-autoplay': 'toggle',
    'next-track': 'next',
    'previous-track': 'previous'
  };
  const action = actionByCommand[command];
  if (!action) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
});

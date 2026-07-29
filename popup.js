const statusElement = document.getElementById('status');
const controls = [...document.querySelectorAll('button[data-action]')];

function setStatus(text, isError = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('error', isError);
}

async function sendAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Активная вкладка не найдена');

  const response = await chrome.tabs.sendMessage(tab.id, { action });
  if (!response?.ok) throw new Error(response?.error || 'Расширение не ответило');
  return response.status;
}

function renderStatus(status) {
  if (!status) return;
  if (status.track) {
    setStatus(`${status.isPlaying ? 'Играет' : 'Остановлено'}: ${status.track}`);
  } else {
    setStatus(status.trackCount ? 'Готово к запуску' : 'На странице нет треков');
  }
}

async function runAction(action) {
  controls.forEach((button) => {
    button.disabled = true;
  });

  try {
    setStatus('Выполняется…');
    renderStatus(await sendAction(action));
  } catch (error) {
    setStatus('Откройте страницу Bandcamp Discover и обновите её после установки расширения.', true);
    console.warn('[Bandcamp Auto Player]', error);
  } finally {
    controls.forEach((button) => {
      button.disabled = false;
    });
  }
}

controls.forEach((button) => {
  button.addEventListener('click', () => void runAction(button.dataset.action));
});

void runAction('status');

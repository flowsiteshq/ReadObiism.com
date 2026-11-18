(() => {
  const button = document.getElementById('share-tiktok');
  const status = document.getElementById('share-status');
  if (!button || !status) return;
  button.addEventListener('click', async () => {
    const url = button.dataset.url;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied. You can paste it when sharing on TikTok.';
    } catch {
      status.textContent = 'Copy this link to share: ' + url;
    }
  });
})();
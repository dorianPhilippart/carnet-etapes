// Resolve against this module so the same build also works under a repository path.
if (window.isSecureContext && 'serviceWorker' in navigator) {
  const worker = new URL('./sw.js', import.meta.url);
  navigator.serviceWorker.register(worker, { updateViaCache: 'none' }).catch(error => {
    console.warn("L’installation du mode hors ligne a échoué.", error.name);
  });
}

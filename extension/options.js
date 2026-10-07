const versionEl = document.getElementById('version');
versionEl.textContent = `Версія розширення: ${chrome.runtime.getManifest().version}`;

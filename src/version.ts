import './query-mount';
import './analytics-mount';

const manifest = chrome.runtime.getManifest();
const displayVersion = manifest.version_name || manifest.version;
const versionElement = document.querySelector<HTMLElement>('#appVersion');

if (versionElement) {
  versionElement.textContent = `v${displayVersion}`;
  versionElement.title = `Versão instalada: ${displayVersion}`;
}

document.title = `Download de Edições DOE · v${displayVersion}`;

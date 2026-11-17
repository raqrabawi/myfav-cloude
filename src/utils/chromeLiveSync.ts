/**
 * Live Chrome Sync utilities:
 * 1. File System Access API + IndexedDB persistent FileSystemFileHandle for 1-click & auto-watch sync with Chrome's live `Bookmarks` file.
 * 2. Pure TypeScript ZIP generator that builds a downloadable Manifest V3 Chrome Companion Extension pre-configured for this AetherMark workspace.
 * 3. 1-Click Browser Bookmarklet generator for saving any active Chrome tab directly into AetherMark.
 */

const DB_NAME = 'aethermark_live_sync_db';
const STORE_NAME = 'file_handles';
const HANDLE_KEY = 'chrome_bookmarks_file_handle';

export interface LiveChromeFileTarget {
  handle: FileSystemFileHandle;
  fileName: string;
  lastModified: number;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveChromeFileHandle(
  handle: FileSystemFileHandle
): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore storage errors
  }
}

export async function getSavedChromeFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openHandleDb();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function clearSavedChromeFileHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export function isInCrossOriginSubframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    !isInCrossOriginSubframe()
  );
}

function pickFileViaStandardInput(): Promise<{
  handle: FileSystemFileHandle | null;
  content: string;
  lastModified: number;
  name: string;
}> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.json,*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        const abortErr = new Error('File selection cancelled');
        abortErr.name = 'AbortError';
        reject(abortErr);
        return;
      }
      try {
        const content = await file.text();
        resolve({
          handle: null,
          content,
          lastModified: file.lastModified,
          name: file.name,
        });
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
      const abortErr = new Error('File selection cancelled');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };

    input.click();
  });
}

export async function pickLiveChromeBookmarksFile(): Promise<{
  handle: FileSystemFileHandle | null;
  content: string;
  lastModified: number;
  name: string;
}> {
  if (!isFileSystemAccessSupported()) {
    return pickFileViaStandardInput();
  }

  try {
    const picker = (window as unknown as {
      showOpenFilePicker: (options?: Record<string, unknown>) => Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker;

    const [handle] = await picker({
      multiple: false,
      excludeAcceptAllOption: false,
    });

    await saveChromeFileHandle(handle);
    const file = await handle.getFile();
    const content = await file.text();
    return {
      handle,
      content,
      lastModified: file.lastModified,
      name: file.name,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    // Fall back to standard file input if blocked by iframe/browser policy
    return pickFileViaStandardInput();
  }
}

export async function readLinkedChromeFile(
  handle: FileSystemFileHandle,
  requestPermissionIfNeeded = true
): Promise<{ content: string; lastModified: number; name: string }> {
  const anyHandle = handle as unknown as {
    queryPermission?: ( desc: { mode: 'read' } ) => Promise<PermissionState>;
    requestPermission?: ( desc: { mode: 'read' } ) => Promise<PermissionState>;
  };

  if (anyHandle.queryPermission) {
    const perm = await anyHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      if (!requestPermissionIfNeeded || !anyHandle.requestPermission) {
        throw new Error('Permission needed to read linked Chrome Bookmarks file.');
      }
      const requested = await anyHandle.requestPermission({ mode: 'read' });
      if (requested !== 'granted') {
        throw new Error('Permission to read Chrome Bookmarks file was denied.');
      }
    }
  }

  const file = await handle.getFile();
  const content = await file.text();
  return {
    content,
    lastModified: file.lastModified,
    name: file.name,
  };
}

/**
 * Generates a 1-click Bookmarklet URL that users can drag to their Chrome Bookmarks Bar.
 * Clicking it on any website opens AetherMark and pre-fills the Save Website modal with that tab's URL and title.
 */
export function generateBookmarkletHref(appOrigin: string): string {
  const cleanUrl = appOrigin.replace(/\/$/, '');
  const code = `(function(){var u=encodeURIComponent(location.href);var t=encodeURIComponent(document.title||location.hostname);window.open('${cleanUrl}/?addUrl='+u+'&addTitle='+t,'_blank','noopener,noreferrer');})();`;
  return `javascript:${code}`;
}

/**
 * Minimal CRC32 & Store-mode ZIP builder (zero external dependencies)
 * so users can download a ready-to-load Chrome Companion Extension (.zip).
 */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZipBlob(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const encodedFiles = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of encodedFiles) {
    const localHeader = new Uint8Array(30 + file.nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed
    lv.setUint16(6, 0, true); // Flags
    lv.setUint16(8, 0, true); // Compression method (0 = store)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0, true); // Mod date
    lv.setUint32(14, file.crc, true); // CRC32
    lv.setUint32(18, file.dataBytes.length, true); // Compressed size
    lv.setUint32(22, file.dataBytes.length, true); // Uncompressed size
    lv.setUint16(26, file.nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(file.nameBytes, 30);

    localParts.push(localHeader, file.dataBytes);

    const centralHeader = new Uint8Array(46 + file.nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0, true); // Flags
    cv.setUint16(10, 0, true); // Compression (0 = store)
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0, true); // Mod date
    cv.setUint32(16, file.crc, true); // CRC32
    cv.setUint32(20, file.dataBytes.length, true); // Compressed size
    cv.setUint32(24, file.dataBytes.length, true); // Uncompressed size
    cv.setUint16(28, file.nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(file.nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + file.dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, arr) => acc + arr.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central directory signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Start disk
  ev.setUint16(8, encodedFiles.length, true); // Entries on disk
  ev.setUint16(10, encodedFiles.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalBytes = offset + centralSize + eocd.length;
  const combined = new ArrayBuffer(totalBytes);
  const out = new Uint8Array(combined);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);

  return new Blob([combined], {
    type: 'application/zip',
  });
}

export function downloadCompanionExtensionZip(appOrigin: string): void {
  const cleanOrigin = appOrigin.replace(/\/$/, '');

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'MyFav — Live Chrome Bookmarks Sync',
      version: '1.0.0',
      description:
        'Automatically syncs your live Google Chrome Bookmarks directly into MyFav without exporting or uploading files.',
      permissions: ['bookmarks', 'tabs', 'scripting', 'storage'],
      host_permissions: [`${cleanOrigin}/*`, 'http://localhost:3000/*'],
      action: {
        default_title: 'Sync Chrome Bookmarks to MyFav',
        default_popup: 'popup.html',
      },
      background: {
        service_worker: 'background.js',
      },
    },
    null,
    2
  );

  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MyFav Live Sync</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 320px;
      background: #070B14;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 16px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .badge {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
    }
    h1 { font-size: 14px; font-weight: 700; }
    p.sub { font-size: 11px; color: #94A3B8; margin-top: 2px; }
    .stats {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 12px;
      color: #CBD5E1;
      margin-bottom: 12px;
    }
    .btn {
      width: 100%;
      padding: 10px 14px;
      border-radius: 10px;
      border: none;
      background: #3B82F6;
      color: white;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 8px;
      transition: background 0.15s;
    }
    .btn:hover { background: #2563EB; }
    .btn-secondary {
      background: rgba(255,255,255,0.07);
      color: #E2E8F0;
      border: 1px solid rgba(255,255,255,0.12);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }
    .status {
      font-size: 11px;
      color: #34D399;
      margin-top: 6px;
      min-height: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="badge">M</div>
    <div>
      <h1>MyFav Live Sync</h1>
      <p class="sub">Zero-upload Chrome Bookmarks bridge</p>
    </div>
  </div>
  <div class="stats" id="stats">Reading Chrome bookmarks...</div>
  <button class="btn" id="syncBtn">Sync to MyFav Now</button>
  <button class="btn btn-secondary" id="saveTabBtn">+ Save Current Tab to MyFav</button>
  <div class="status" id="status"></div>
  <script src="popup.js"></script>
</body>
</html>`;

  const popupJs = `const APP_ORIGIN = "${cleanOrigin}";

function countNodes(nodes) {
  let bookmarks = 0;
  let folders = 0;
  function walk(list) {
    for (const n of list) {
      if (n.url) bookmarks++;
      else if (n.children) {
        folders++;
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return { bookmarks, folders };
}

chrome.bookmarks.getTree((tree) => {
  const { bookmarks, folders } = countNodes(tree);
  document.getElementById('stats').textContent =
    \`Detected \${bookmarks} Chrome bookmarks across \${folders} folders.\`;
});

async function pushTreeToMyFav() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Syncing with MyFav...';

  const tree = await chrome.bookmarks.getTree();
  const payload = JSON.stringify(tree);

  const tabs = await chrome.tabs.query({});
  const targetTab = tabs.find(
    (t) => t.url && (t.url.startsWith(APP_ORIGIN) || t.url.startsWith('http://localhost:3000'))
  );

  if (targetTab && targetTab.id) {
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (rawTreeJson) => {
        window.postMessage(
          { type: 'AETHERMARK_EXTENSION_SYNC', payload: rawTreeJson },
          '*'
        );
      },
      args: [payload],
    });
    statusEl.textContent = 'Synced directly to open MyFav tab!';
  } else {
    const newTab = await chrome.tabs.create({ url: APP_ORIGIN });
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === newTab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            func: (rawTreeJson) => {
              window.postMessage(
                { type: 'AETHERMARK_EXTENSION_SYNC', payload: rawTreeJson },
                '*'
              );
            },
            args: [payload],
          });
        }, 800);
      }
    });
    statusEl.textContent = 'Opened MyFav & syncing!';
  }
}

document.getElementById('syncBtn').addEventListener('click', pushTreeToMyFav);

document.getElementById('saveTabBtn').addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.url) return;
  const targetUrl =
    APP_ORIGIN +
    '/?addUrl=' +
    encodeURIComponent(activeTab.url) +
    '&addTitle=' +
    encodeURIComponent(activeTab.title || activeTab.url);
  chrome.tabs.create({ url: targetUrl });
});
`;

  const backgroundJs = `const APP_ORIGIN = "${cleanOrigin}";

async function autoPushToOpenTabs() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const payload = JSON.stringify(tree);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && (tab.url.startsWith(APP_ORIGIN) || tab.url.startsWith('http://localhost:3000'))) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (rawTreeJson) => {
            window.postMessage(
              { type: 'AETHERMARK_EXTENSION_SYNC', payload: rawTreeJson },
              '*'
            );
          },
          args: [payload],
        }).catch(() => {});
      }
    }
  } catch (e) {
    // ignore
  }
}

chrome.bookmarks.onCreated.addListener(autoPushToOpenTabs);
chrome.bookmarks.onRemoved.addListener(autoPushToOpenTabs);
chrome.bookmarks.onChanged.addListener(autoPushToOpenTabs);
chrome.bookmarks.onMoved.addListener(autoPushToOpenTabs);
`;

  const readmeTxt = `MyFav — Live Chrome Bookmarks Companion Extension
======================================================

How to install in 30 seconds:
1. Unzip this downloaded file ("myfav-chrome-sync-extension.zip") into a folder on your computer.
2. Open Google Chrome and go to: chrome://extensions
3. Turn ON "Developer mode" (top-right toggle), click "Load unpacked" (top-left), and select the unzipped folder.

Now, whenever you add, edit, or move a bookmark in Chrome—or click the MyFav extension icon—your Chrome Bookmarks will sync directly into MyFav without ever exporting or uploading a file!
`;

  const zipBlob = createZipBlob([
    { name: 'manifest.json', content: manifestJson },
    { name: 'popup.html', content: popupHtml },
    { name: 'popup.js', content: popupJs },
    { name: 'background.js', content: backgroundJs },
    { name: 'README.txt', content: readmeTxt },
  ]);

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'myfav-chrome-sync-extension.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}


const SLIDER_CONFIGS = [
  { name: 'BaseSpin', label: 'Base Spin', min: 0, max: 180, initial: 90 },
  { name: 'BaseArm', label: 'Base Arm', min: 0, max: 180, initial: 90 },
  { name: 'MidArm', label: 'Mid Arm', min: 0, max: 180, initial: 90 },
  { name: 'GripperArm', label: 'Gripper Arm', min: 0, max: 180, initial: 90 },
  // Finger removed from slider list; replaced by Open/Close buttons below
];

const NODE_RED_ENDPOINT = '/update-robot-arm';

// --- STATE ---
let statusTimer;
const sliderValues = {};
SLIDER_CONFIGS.forEach(config => {
    sliderValues[config.name] = config.initial;
});

// --- DOM ELEMENTS ---
const sliderContainer = document.getElementById('slider-container');
const statusIndicator = document.getElementById('status-indicator');
const messageArea = document.getElementById('message-area');
const topMessage = document.getElementById('top-message');

// Auto-close on persistent error: timers & flags
let errorCloseTimer = null;
let siteClosed = false;

function scheduleAutoClose() {
  // schedule shutdown in 5 seconds
  if (errorCloseTimer) clearTimeout(errorCloseTimer);
  errorCloseTimer = setTimeout(() => {
    shutdownSite('Closed automatically due to persistent error.');
  }, 5000);
}

function clearAutoClose() {
  if (errorCloseTimer) {
    clearTimeout(errorCloseTimer);
    errorCloseTimer = null;
  }
}

function shutdownSite(reason) {
  if (siteClosed) return;
  siteClosed = true;
  console.warn('Shutting down site:', reason);

  // Close websocket if open
  try {
    if (ws) {
      try { ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
  } catch (e) {
    console.warn('Error while closing WS during shutdown', e);
  }

  // Disable interactive controls (sliders & buttons)
  document.querySelectorAll('input, button').forEach(el => {
    try { el.disabled = true; } catch (e) { /* ignore */ }
  });



  // Some browsers won't allow programmatic close; attempt it anyway
  try { window.close(); } catch (e) { /* ignore */ }

  // If the browser blocked close (most user-opened tabs), navigate away as a fallback
  setTimeout(() => {
    try {
      // If window is still open, navigate to about:blank to effectively 'close' the app
      if (!window.closed) {
        window.location.href = 'about:blank';
      }
    } catch (e) {
      // ignore navigation errors
    }
  }, 200);
}

function showErrorOverlay(message) {
  // Remove any existing error overlay
  const existing = document.getElementById('error-overlay');
  if (existing) existing.remove();

  // Create full-screen error overlay with an OK button
  const overlay = document.createElement('div');
  overlay.id = 'error-overlay';
  overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-6 max-w-3xl mx-4 text-center">
      <h2 class="text-xl font-bold mb-2">Error</h2>
      <p class="mb-4 text-left whitespace-pre-wrap">${String(message)}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  // Passive overlay: no dismiss button. Auto-close will handle shutdown if necessary.
}

// --- FUNCTIONS ---



/**
 * Updates the status indicator in the UI.
 * @param {'idle' | 'sending' | 'success' | 'error'} status The current status.
 * @param {string} [message] An optional error message.
 */
let lastErrorTime = 0;
let isShowingError = false;


function updateStatusIndicator(status, message = '') {
  const now = Date.now();

  // --- FOUTMELDING HEEFT HOOGSTE PRIORITEIT ---
  if (status === 'error') {
    lastErrorTime = now;
    isShowingError = true;
    clearTimeout(statusTimer); // Stop other timers
  }

  // --- BLOCK success/ack while an error is shown ---
  if ((status === 'success' || status === 'ack') && isShowingError) {
    console.log('Success blocked: error active');
    return;
  }

  // --- Only allow idle when no error is showing ---
  if (status === 'idle' && isShowingError) return;

  clearTimeout(statusTimer);
  let html = '';

  switch (status) {
    case 'sending':
      html = `<div class="flex items-center text-sm text-yellow-600 dark:text-yellow-400">
        <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Verzenden...
      </div>`;
      break;

    case 'success':
    case 'ack':
      html = `<div class="flex items-center text-sm text-green-600 dark:text-green-400">
        <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        Opgeslagen
      </div>`;
      statusTimer = setTimeout(() => updateStatusIndicator('idle'), 2000);
      break;

    case 'error': {
      const displayMsg = message || 'Onbekende fout';
      // Remove truncation so full message is visible and allow wrapping
      html = `<div class="flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-2 border border-red-200 dark:border-red-800">
        <svg class="h-4 w-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="font-medium break-words whitespace-normal">${displayMsg}</div>
      </div>`;
      // No timer — stays visible until cleared
      break;
    }

    default:
      if (!isShowingError) html = `<div class="h-5"></div>`;
      break;
  }

  // If it's an error, show full-screen overlay (not the top banner)
  if (status === 'error') {
    // show full-screen overlay with OK button
    showErrorOverlay(message || 'Onbekende fout');
    // keep a minimal placeholder in the top-right
    statusIndicator.innerHTML = `<div class="h-5"></div>`;
  } else {
    // Clear any overlays/messages and render normal status in top-right
    const errOverlay = document.getElementById('error-overlay');
    if (errOverlay) errOverlay.remove();
    if (topMessage) topMessage.innerHTML = '';
    if (messageArea) messageArea.innerHTML = '';
    statusIndicator.innerHTML = html;
  }

  // schedule auto-close on persistent error; clear timer otherwise
  if (status === 'error') scheduleAutoClose(); else clearAutoClose();
}



// WebSocket client to send slider values to Node-RED
let ws = null;
let wsBackoff = 1000;
let wsMaxBackoff = 30000;
let wsOpen = false;
const wsQueue = [];

function connectWebSocket() {
  try {
    ws = new WebSocket('wss://node-red.xyz/ws/robot-arm');
  } catch (err) {
    console.error('WebSocket constructor error:', err);
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    console.info('WebSocket connected');
    wsBackoff = 1000;
    wsOpen = true;
    updateStatusIndicator('success');
    // flush queue
    while (wsQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const msg = wsQueue.shift();
      ws.send(msg);
    }
  });

  ws.addEventListener('message', (ev) => {
    console.log("RAW DATA:", ev.data); // ← VOEG DIT TOE
    // Handle incoming messages from server. Expected JSON shapes:
    // { type: 'update', servo: '<Name>', angle: <number> }
    // { type: 'state', sliders: { '<Name>': <angle>, ... } }
    // { type: 'heartbeat' | 'pong' }
    // { type: 'ack' }
    // { type: 'error', message: '...' }
    console.debug('WS message raw:', ev.data);
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (err) {
      console.warn('Received non-JSON WS message:', ev.data);
      return;
    }
    // Also log the parsed object for easier debugging
    console.debug('WS message parsed:', msg);

    // Update a single servo value
    if (msg.type === 'update' && msg.servo) {
      const name = String(msg.servo);
      const angle = Number(msg.angle);
      if (!Number.isNaN(angle)) {
        sliderValues[name] = angle;
        const sliderEl = document.getElementById(name);
        if (sliderEl && sliderEl.classList.contains('slider')) {
          sliderEl.value = angle;
          const span = document.getElementById(`${name}-value`);
          if (span) span.textContent = String(angle);
        } else if (name === 'Finger') {
          // no slider for finger; show a brief success indicator
          updateStatusIndicator('success', `Finger ${angle}`);
        }
      }
      return;
    }

    // Full state sync (set of sliders)
    if (msg.type === 'state' && msg.sliders && typeof msg.sliders === 'object') {
      Object.entries(msg.sliders).forEach(([name, value]) => {
        const angle = Number(value);
        if (Number.isNaN(angle)) return;
        sliderValues[name] = angle;
        const sliderEl = document.getElementById(name);
        if (sliderEl && sliderEl.classList.contains('slider')) {
          sliderEl.value = angle;
          const span = document.getElementById(`${name}-value`);
          if (span) span.textContent = String(angle);
        }
      });
      updateStatusIndicator('success');
      return;
    }

    // Heartbeat / pong from server
    if (msg.type === 'heartbeat' || msg.type === 'pong') {
      // small visual feedback in console and a subtle success indicator
      console.debug('Received heartbeat/pong from server');
      // Avoid constantly flipping the status; show brief success
      updateStatusIndicator('success');
      return;
    }

    // Acknowledgement message
    if (msg.type === 'ack') {
      updateStatusIndicator('success');
      return;
    }

    // Server-side error message
    if (msg.type === 'error') {
      const m = msg.message || 'Server error';
      // Show the error overlay immediately with server message
      updateStatusIndicator('error', m);
      console.warn('Server error message:', m);
      return;
    }

    // Unknown / unhandled message types
    console.debug('Unhandled WS message:', msg);
  });

  // ws.addEventListener('close', (ev) => {
  //   console.warn('WebSocket closed', ev);
  //   wsOpen = false;
  //   updateStatusIndicator('error', 'fuck off');
  //   scheduleReconnect();
  // });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket error', err);
    wsOpen = false;
    updateStatusIndicator('error', 'WebSocket error');
    // let close handler decide reconnect
  });
}

function scheduleReconnect() {
  setTimeout(() => {
    wsBackoff = Math.min(wsBackoff * 1.5, wsMaxBackoff);
    connectWebSocket();
  }, wsBackoff);
}

// initialize websocket
connectWebSocket();

// Heartbeat: send every 10 seconds to keep the connection alive
// Sends: { "type": "heartbeat" }
setInterval(() => {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat' }));
    }
  } catch (err) {
    // don't let heartbeat exceptions break the interval
    console.warn('Heartbeat send failed', err);
  }
}, 10000);

/**
 * Handles the input event for any slider.
 * @param {Event} event The input event object.
 */
/**
 * Update the UI/state when the slider moves (fired on input).
 * Do NOT send over the network here; sending happens on change/release.
 */
function updateSliderValue(event) {
    const { id: name, value } = event.target;
    const numericValue = parseInt(value, 10);

    // Update value display in UI
    document.getElementById(`${name}-value`).textContent = numericValue.toString();

    // Update state object
    sliderValues[name] = numericValue;
}

/**
 * Send the slider value when the user releases the control (change event).
 */
function handleSliderRelease(event) {
    const { id: name, value } = event.target;
    const numericValue = parseInt(value, 10);

    // Prepare payload in requested format
    const payload = JSON.stringify({ servo: name, angle: numericValue });
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        updateStatusIndicator('sending');
        // optimistic success
        setTimeout(() => updateStatusIndicator('success'), 150);
      } else {
        wsQueue.push(payload);
        updateStatusIndicator('error', 'WebSocket not connected, queued');
      }
    } catch (err) {
      console.error('Failed to send via WebSocket:', err);
      wsQueue.push(payload);
      updateStatusIndicator('error', err instanceof Error ? err.message : String(err));
    }
}

/**
 * Helper to send a servo command (used by buttons)
 */
function sendServo(name, numericValue) {
  const payload = JSON.stringify({ servo: name, angle: numericValue });
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      updateStatusIndicator('sending');
      setTimeout(() => updateStatusIndicator('success'), 150);
    } else {
      wsQueue.push(payload);
      updateStatusIndicator('error', 'WebSocket not connected, queued');
    }
  } catch (err) {
    console.error('Failed to send via WebSocket:', err);
    wsQueue.push(payload);
    updateStatusIndicator('error', err instanceof Error ? err.message : String(err));
  }
}

// --- INITIALIZATION ---

// Create and append sliders to the container
const sliderFragment = document.createDocumentFragment();
SLIDER_CONFIGS.forEach(config => {
    const controlHtml = `
        <div class="flex flex-col space-y-2 w-full">
          <div class="flex justify-between items-center">
            <label for="${config.name}" class="font-medium text-slate-700 dark:text-slate-300 select-none">
              ${config.label}
            </label>
            <span id="${config.name}-value" class="text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-3 py-1 w-14 text-center">
              ${config.initial}
            </span>
          </div>
          <input
            id="${config.name}"
            type="range"
            min="${config.min}"
            max="${config.max}"
            value="${config.initial}"
            class="slider w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = controlHtml;
    sliderFragment.appendChild(tempDiv.firstElementChild);
});
sliderContainer.appendChild(sliderFragment);

// --- Finger control: two grey buttons with black text ---
// No numeric badge, just Open/Close buttons.
sliderValues['Finger'] = 90; // default/neutral value
const fingerHtml = `
  <div class="flex flex-col space-y-2 w-full">
    <div class="flex justify-between items-center">
      <label class="font-medium text-slate-700 dark:text-slate-300 select-none">Finger</label>
    </div>
    <div class="flex gap-3">
      <button id="Finger-open" class="flex-1 bg-gray-200 hover:bg-gray-300 text-black rounded-md px-3 py-2">Open</button>
      <button id="Finger-close" class="flex-1 bg-gray-200 hover:bg-gray-300 text-black rounded-md px-3 py-2">Close</button>
    </div>
  </div>
`;
const fingerDiv = document.createElement('div');
fingerDiv.innerHTML = fingerHtml;
sliderContainer.appendChild(fingerDiv.firstElementChild);

// Add event listeners to all sliders
document.querySelectorAll('.slider').forEach(slider => {
  // update on input for UI feedback
  slider.addEventListener('input', updateSliderValue);
  // send only when interaction is finished (mouse release / touch end / keyboard change)
  slider.addEventListener('change', handleSliderRelease);
});

// Finger buttons event listeners (Open/Close)
const fingerOpen = document.getElementById('Finger-open');
const fingerClose = document.getElementById('Finger-close');
if (fingerOpen && fingerClose) {
  fingerOpen.addEventListener('click', () => {
    sliderValues['Finger'] = 50; // open
    sendServo('Finger', 50);
  });

  fingerClose.addEventListener('click', () => {
    sliderValues['Finger'] = 0; // close -> send 50 per request
    sendServo('Finger', 0);
  });
}

// Set initial status
updateStatusIndicator('idle');

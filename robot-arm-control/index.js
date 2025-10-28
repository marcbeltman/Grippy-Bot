
const SLIDER_CONFIGS = [
  { name: 'BaseSpin', label: 'Base Spin', min: 0, max: 180, initial: 90 },
  { name: 'BaseArm', label: 'Base Arm', min: 0, max: 180, initial: 90 },
  { name: 'MidArm', label: 'Mid Arm', min: 0, max: 180, initial: 90 },
  { name: 'GripperArm', label: 'Gripper Arm', min: 0, max: 180, initial: 90 },
  { name: 'Finger', label: 'Finger', min: 0, max: 180, initial: 90 },
];

const NODE_RED_ENDPOINT = '/update-robot-arm';

// --- STATE ---
let debounceTimer;
let statusTimer;
const sliderValues = {};
SLIDER_CONFIGS.forEach(config => {
    sliderValues[config.name] = config.initial;
});

// --- DOM ELEMENTS ---
const sliderContainer = document.getElementById('slider-container');
const statusIndicator = document.getElementById('status-indicator');

// --- FUNCTIONS ---

/**
 * Updates the status indicator in the UI.
 * @param {'idle' | 'sending' | 'success' | 'error'} status The current status.
 * @param {string} [message] An optional error message.
 */
function updateStatusIndicator(status, message = '') {
    clearTimeout(statusTimer);
    let html = '';
    switch (status) {
        case 'sending':
            html = `<div class="flex items-center text-sm text-yellow-600 dark:text-yellow-400">
                <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Verzenden...
            </div>`;
            break;
        case 'success':
            html = `<div class="flex items-center text-sm text-green-600 dark:text-green-400">
                <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                Opgeslagen
            </div>`;
            statusTimer = setTimeout(() => updateStatusIndicator('idle'), 2000);
            break;
        case 'error':
            html = `<div class="flex items-center text-sm text-red-600 dark:text-red-400" title="${message}">
                <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Fout
            </div>`;
            statusTimer = setTimeout(() => updateStatusIndicator('idle'), 2000);
            break;
        default: // idle
            html = `<div class="h-5"></div>`; // Placeholder for alignment
    }
    statusIndicator.innerHTML = html;
}

/**
 * Sends the current slider data to the Node-RED endpoint.
 * @param {object} data The slider values to send.
 */
async function sendSliderData(data) {
  try {
    const response = await fetch(NODE_RED_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send data to Node-RED:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, message: `Failed to send data: ${errorMessage}` };
  }
}

/**
 * Handles the input event for any slider.
 * @param {Event} event The input event object.
 */
function handleSliderChange(event) {
    const { id: name, value } = event.target;
    const numericValue = parseInt(value, 10);
    
    // Update value display in UI
    document.getElementById(`${name}-value`).textContent = numericValue.toString();
    
    // Update state object
    sliderValues[name] = numericValue;
    
    // Debounce API call
    clearTimeout(debounceTimer);
    updateStatusIndicator('sending');
    
    debounceTimer = setTimeout(async () => {
        const result = await sendSliderData(sliderValues);
        if (result.success) {
            updateStatusIndicator('success');
        } else {
            updateStatusIndicator('error', result.message);
        }
    }, 500); // Debounce by 500ms
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

// Add event listeners to all sliders
document.querySelectorAll('.slider').forEach(slider => {
    slider.addEventListener('input', handleSliderChange);
});

// Set initial status
updateStatusIndicator('idle');

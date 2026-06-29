// settings/input/input.js
import { generateKeybindingsConf } from '../../configManager.js';

const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;
const { invoke } = window.__TAURI__.core;
const { path } = window.__TAURI__;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const INPUT_JSON = CONFIG_DIR + 'input.json';
const INPUT_CONF = CONFIG_DIR + 'input.conf';
const LAYOUT_SCRIPT = CONFIG_DIR + 'scripts/cycle-layout.sh';
const HOME = BaseDirectory.Home;

// Default values (expanded with all mouse settings and additional keyboard)
const DEFAULT_SETTINGS = {
	keyboard: {
		repeatRate: 30,
		repeatDelay: 300,
		xkbModel: 'pc105',
		xkbOptions: '',
		xkbNumlock: false
	},
	mouse: {
		accelProfile: 'adaptive',
		accelSpeed: 0.0,
		naturalScroll: false,
		tapToClick: false,
		leftHanded: false,
		dwt: false,
		scrollMethod: 'two_finger',
		scrollButton: 274,
		tapButtonMap: 'lrm',
		dragLock: false,
		middleEmulation: false,
		clickMethod: 'none'
	},
	layouts: [
		{ layout: 'us', variant: '' },
		{ layout: 'ch', variant: 'de' }
	],
	layoutKeys: [] // array of key combo strings (e.g., ["$mod+space", "$mod+Shift+l"])
};

let currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let container, statusDiv;
let layoutListDiv, layoutKeysListDiv;

// DOM elements for keyboard/mouse
let repeatRateInput, repeatDelayInput, accelProfileSelect, accelSpeedInput,
	naturalScrollCheck, tapToClickCheck;

// New keyboard elements
let xkbModelInput, xkbOptionsInput, xkbNumlockCheck;

// Advanced mouse elements
let leftHandedCheck, dwtCheck, scrollMethodSelect, scrollButtonInput, scrollButtonGroup,
	tapButtonMapSelect, dragLockCheck, middleEmulationCheck, clickMethodSelect;

// Key recording state
let activeRecordInput = null;
let recording = false;
let recordingIndex = -1; // index of the key combo being recorded

// ---------- Helper: parse key combo into modifiers and base key ----------
function parseKeyCombo(combo) {
	const parts = combo.split('+');
	const baseKey = parts.pop();
	const modifiers = { Ctrl: false, Alt: false, Shift: false, Super: false };
	parts.forEach(p => {
		if (p === 'Ctrl') modifiers.Ctrl = true;
		else if (p === 'Alt') modifiers.Alt = true;
		else if (p === 'Shift') modifiers.Shift = true;
		else if (p === '$mod') modifiers.Super = true;
	});
	return { modifiers, baseKey };
}

function buildKeyCombo(modifiers, baseKey) {
	const parts = [];
	if (modifiers.Ctrl) parts.push('Ctrl');
	if (modifiers.Alt) parts.push('Alt');
	if (modifiers.Shift) parts.push('Shift');
	if (modifiers.Super) parts.push('$mod');
	parts.push(baseKey);
	return parts.join('+');
}

// ---------- Load settings ----------
async function loadSettings() {
	try {
		let content = '';
		try {
			content = await readTextFile(INPUT_JSON, { baseDir: HOME });
		} catch (err) {
			if (!err.toString().includes('No such file or directory')) throw err;
		}
		if (content) {
			const saved = JSON.parse(content);
			currentSettings = { ...DEFAULT_SETTINGS, ...saved };
			if (saved.layouts) currentSettings.layouts = saved.layouts;
			if (saved.layoutKeys) currentSettings.layoutKeys = saved.layoutKeys;
			// Merge mouse and keyboard settings deeply
			if (saved.keyboard) {
				currentSettings.keyboard = { ...DEFAULT_SETTINGS.keyboard, ...saved.keyboard };
			}
			if (saved.mouse) {
				currentSettings.mouse = { ...DEFAULT_SETTINGS.mouse, ...saved.mouse };
			}
		} else {
			currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
		}
		updateUI();
	} catch (error) {
		showStatus('Error loading settings: ' + error, 'error');
	}
}

// ---------- Update UI from currentSettings ----------
function updateUI() {
	repeatRateInput.value = currentSettings.keyboard.repeatRate;
	repeatDelayInput.value = currentSettings.keyboard.repeatDelay;
	xkbModelInput.value = currentSettings.keyboard.xkbModel;
	xkbOptionsInput.value = currentSettings.keyboard.xkbOptions;
	xkbNumlockCheck.checked = currentSettings.keyboard.xkbNumlock;

	accelProfileSelect.value = currentSettings.mouse.accelProfile;
	accelSpeedInput.value = currentSettings.mouse.accelSpeed;
	naturalScrollCheck.checked = currentSettings.mouse.naturalScroll;
	tapToClickCheck.checked = currentSettings.mouse.tapToClick;

	// Advanced mouse
	leftHandedCheck.checked = currentSettings.mouse.leftHanded;
	dwtCheck.checked = currentSettings.mouse.dwt;
	scrollMethodSelect.value = currentSettings.mouse.scrollMethod;
	scrollButtonInput.value = currentSettings.mouse.scrollButton;
	tapButtonMapSelect.value = currentSettings.mouse.tapButtonMap;
	dragLockCheck.checked = currentSettings.mouse.dragLock;
	middleEmulationCheck.checked = currentSettings.mouse.middleEmulation;
	clickMethodSelect.value = currentSettings.mouse.clickMethod;
	updateScrollButtonVisibility();

	renderLayoutList();
	renderLayoutKeysList();
}

// ---------- Render layout list ----------
function renderLayoutList() {
	layoutListDiv.innerHTML = '';
	currentSettings.layouts.forEach((layout, idx) => {
		const div = document.createElement('div');
		div.className = 'layout-item';
		div.style.marginBottom = '0.5rem';
		div.innerHTML = `
			<input type="text" class="layout-layout" data-index="${idx}" value="${layout.layout}" placeholder="Layout (e.g., us, ch)" style="width:150px;" />
			<input type="text" class="layout-variant" data-index="${idx}" value="${layout.variant || ''}" placeholder="Variant (e.g., dvorak)" style="width:150px;" />
			<button class="remove-layout" data-index="${idx}">🗑️</button>
		`;
		layoutListDiv.appendChild(div);
	});

	document.querySelectorAll('.layout-layout').forEach(input => {
		input.addEventListener('input', (e) => {
			const idx = e.target.dataset.index;
			currentSettings.layouts[idx].layout = e.target.value;
		});
	});
	document.querySelectorAll('.layout-variant').forEach(input => {
		input.addEventListener('input', (e) => {
			const idx = e.target.dataset.index;
			currentSettings.layouts[idx].variant = e.target.value;
		});
	});
	document.querySelectorAll('.remove-layout').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const idx = e.target.dataset.index;
			currentSettings.layouts.splice(idx, 1);
			renderLayoutList();
		});
	});
}

// ---------- Render layout keys list ----------
function renderLayoutKeysList() {
	layoutKeysListDiv.innerHTML = '';
	currentSettings.layoutKeys.forEach((keyCombo, idx) => {
		const { modifiers, baseKey } = parseKeyCombo(keyCombo);
		const div = document.createElement('div');
		div.className = 'layout-key-item';
		div.style.marginBottom = '0.5rem';
		div.style.display = 'flex';
		div.style.gap = '0.5rem';
		div.style.alignItems = 'center';
		div.innerHTML = `
			<label><input type="checkbox" class="mod-ctrl" data-index="${idx}" ${modifiers.Ctrl ? 'checked' : ''}> Ctrl</label>
			<label><input type="checkbox" class="mod-alt" data-index="${idx}" ${modifiers.Alt ? 'checked' : ''}> Alt</label>
			<label><input type="checkbox" class="mod-shift" data-index="${idx}" ${modifiers.Shift ? 'checked' : ''}> Shift</label>
			<label><input type="checkbox" class="mod-super" data-index="${idx}" ${modifiers.Super ? 'checked' : ''}> Super ($mod)</label>
			<input type="text" class="base-key" data-index="${idx}" value="${baseKey}" placeholder="Key" style="width:80px;" />
			<button class="record-key" data-index="${idx}">🎤</button>
			<button class="remove-key" data-index="${idx}">🗑️</button>
		`;
		layoutKeysListDiv.appendChild(div);
	});

	// Attach event listeners to new elements
	document.querySelectorAll('.mod-ctrl, .mod-alt, .mod-shift, .mod-super').forEach(cb => {
		cb.addEventListener('change', (e) => {
			const idx = e.target.dataset.index;
			updateKeyComboFromRow(idx);
		});
	});

	document.querySelectorAll('.base-key').forEach(input => {
		input.addEventListener('input', (e) => {
			const idx = e.target.dataset.index;
			updateKeyComboFromRow(idx);
		});
	});

	document.querySelectorAll('.record-key').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const idx = e.target.dataset.index;
			const input = document.querySelector(`.base-key[data-index="${idx}"]`);
			if (input) startKeyRecording(input, idx);
		});
	});

	document.querySelectorAll('.remove-key').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const idx = e.target.dataset.index;
			currentSettings.layoutKeys.splice(idx, 1);
			renderLayoutKeysList();
		});
	});
}

// Helper to update the keyCombo string from a row's current values
function updateKeyComboFromRow(index) {
	const row = document.querySelector(`.layout-key-item:has(.base-key[data-index="${index}"])`);
	if (!row) return;
	const modCtrls = row.querySelectorAll('.mod-ctrl');
	const modAlts = row.querySelectorAll('.mod-alt');
	const modShifts = row.querySelectorAll('.mod-shift');
	const modSupers = row.querySelectorAll('.mod-super');
	const baseKeyInput = row.querySelector('.base-key');
	if (!baseKeyInput) return;
	const modifiers = {
		Ctrl: modCtrls[0]?.checked || false,
		Alt: modAlts[0]?.checked || false,
		Shift: modShifts[0]?.checked || false,
		Super: modSupers[0]?.checked || false
	};
	const baseKey = baseKeyInput.value.trim();
	if (baseKey) {
		currentSettings.layoutKeys[index] = buildKeyCombo(modifiers, baseKey);
	} else {
		// If base key is empty, we might keep the old value or set empty? Better to keep old.
		// We'll just not update if baseKey empty.
	}
}

// ---------- Key recording (for base key) ----------
function startKeyRecording(inputElement, index) {
	if (recording) stopKeyRecording();
	activeRecordInput = inputElement;
	recordingIndex = index;
	recording = true;
	inputElement.value = 'Press a key...';
	document.addEventListener('keydown', handleKeyRecord);
}

function stopKeyRecording() {
	recording = false;
	recordingIndex = -1;
	if (activeRecordInput) activeRecordInput = null;
	document.removeEventListener('keydown', handleKeyRecord);
}

function handleKeyRecord(event) {
	event.preventDefault();
	event.stopPropagation();
	if (!activeRecordInput || recordingIndex === -1) return;

	// Ignore modifier keys themselves
	if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta' || event.key === 'OS') {
		return;
	}

	const keyMap = {
		' ': 'space',
		'Enter': 'Return',
		'Escape': 'Escape',
		'Tab': 'Tab',
		'ArrowUp': 'Up',
		'ArrowDown': 'Down',
		'ArrowLeft': 'Left',
		'ArrowRight': 'Right'
	};
	let key = event.key;
	if (keyMap.hasOwnProperty(key)) key = keyMap[key];

	activeRecordInput.value = key;
	// Update the binding
	updateKeyComboFromRow(recordingIndex);
	stopKeyRecording();
}

// ---------- Gather current values into object ----------
function gatherSettings() {
	// First, ensure all rows are synced
	for (let i = 0; i < currentSettings.layoutKeys.length; i++) {
		updateKeyComboFromRow(i);
	}
	return {
		keyboard: {
			repeatRate: parseInt(repeatRateInput.value, 10) || 30,
			repeatDelay: parseInt(repeatDelayInput.value, 10) || 300,
			xkbModel: xkbModelInput.value.trim(),
			xkbOptions: xkbOptionsInput.value.trim(),
			xkbNumlock: xkbNumlockCheck.checked
		},
		mouse: {
			accelProfile: accelProfileSelect.value,
			accelSpeed: parseFloat(accelSpeedInput.value) || 0,
			naturalScroll: naturalScrollCheck.checked,
			tapToClick: tapToClickCheck.checked,
			leftHanded: leftHandedCheck.checked,
			dwt: dwtCheck.checked,
			scrollMethod: scrollMethodSelect.value,
			scrollButton: parseInt(scrollButtonInput.value, 10) || 274,
			tapButtonMap: tapButtonMapSelect.value,
			dragLock: dragLockCheck.checked,
			middleEmulation: middleEmulationCheck.checked,
			clickMethod: clickMethodSelect.value
		},
		layouts: currentSettings.layouts,
		layoutKeys: currentSettings.layoutKeys.filter(k => k && k.trim() !== '')
	};
}

// ---------- Save settings ----------
async function saveSettings() {
	const newSettings = gatherSettings();
	currentSettings = newSettings;

	try {
		await writeTextFile(INPUT_JSON, JSON.stringify(newSettings, null, 2), { baseDir: HOME });

		// Generate input.conf
		const confLines = [];

		confLines.push('input type:keyboard {');
		confLines.push(`	repeat_rate ${newSettings.keyboard.repeatRate}`);
		confLines.push(`	repeat_delay ${newSettings.keyboard.repeatDelay}`);
		if (newSettings.keyboard.xkbModel) {
			confLines.push(`	xkb_model ${newSettings.keyboard.xkbModel}`);
		}
		if (newSettings.keyboard.xkbOptions) {
			confLines.push(`	xkb_options ${newSettings.keyboard.xkbOptions}`);
		}
		if (newSettings.keyboard.xkbNumlock) {
			confLines.push(`	xkb_numlock enabled`);
		}
		if (newSettings.layouts.length > 0) {
			const layouts = newSettings.layouts.map(l => l.layout).join(',');
			const variants = newSettings.layouts.map(l => l.variant || '').join(',');
			confLines.push(`	xkb_layout ${layouts}`);
			confLines.push(`	xkb_variant ${variants}`);
		}
		confLines.push('}');

		confLines.push('input type:touchpad {');
		confLines.push(`	accel_profile ${newSettings.mouse.accelProfile}`);
		confLines.push(`	pointer_accel ${newSettings.mouse.accelSpeed}`);
		confLines.push(`	natural_scroll ${newSettings.mouse.naturalScroll ? 'enabled' : 'disabled'}`);
		confLines.push(`	tap ${newSettings.mouse.tapToClick ? 'enabled' : 'disabled'}`);
		confLines.push(`	left_handed ${newSettings.mouse.leftHanded ? 'enabled' : 'disabled'}`);
		confLines.push(`	dwt ${newSettings.mouse.dwt ? 'enabled' : 'disabled'}`);
		confLines.push(`	scroll_method ${newSettings.mouse.scrollMethod}`);
		if (newSettings.mouse.scrollMethod === 'on_button_down') {
			confLines.push(`	scroll_button ${newSettings.mouse.scrollButton}`);
		}
		confLines.push(`	tap_button_map ${newSettings.mouse.tapButtonMap}`);
		confLines.push(`	drag_lock ${newSettings.mouse.dragLock ? 'enabled' : 'disabled'}`);
		confLines.push(`	middle_emulation ${newSettings.mouse.middleEmulation ? 'enabled' : 'disabled'}`);
		confLines.push(`	click_method ${newSettings.mouse.clickMethod}`);
		confLines.push('}');

		await writeTextFile(INPUT_CONF, confLines.join('\n'), { baseDir: HOME });

		await generateLayoutScript(newSettings);
		await ensureIncludeLine();

		// Update keybindings.json with all layout keys
		await updateKeybindings(newSettings.layoutKeys);

		showStatus('Input settings saved. Reload i3/sway with $mod+Shift+c', 'success');
	} catch (error) {
		showStatus('Error saving: ' + error, 'error');
	}
}

// ---------- Generate layout cycle script ----------
async function generateLayoutScript(settings) {
	const scriptPath = LAYOUT_SCRIPT;
	const numLayouts = settings.layouts.length;
	let scriptContent = `#!/bin/bash
# cycle-layout.sh – generated by MyI3ConfigSettings
# Cycles through keyboard layouts

LAYOUTS=(${settings.layouts.map(l => `"${l.layout}"`).join(' ')})
VARIANTS=(${settings.layouts.map(l => `"${l.variant || ''}"`).join(' ')})`;

	scriptContent += `

if [ -n "$SWAYSOCK" ]; then
	# Sway – use xkb_switch_layout to cycle
	# Get the current layout index from the first keyboard
	CURRENT=$(swaymsg -t get_inputs | jq -r '[.[] | select(.type == "keyboard") | .xkb_active_layout_index][0]')
	if [ -z "$CURRENT" ] || [ "$CURRENT" = "null" ]; then
		CURRENT=0
	fi
	NEXT=$(( (CURRENT + 1) % ${numLayouts} ))
	swaymsg input type:keyboard xkb_switch_layout "$NEXT"
else
	# i3 – use setxkbmap
	CURRENT_LAYOUT=$(setxkbmap -query | grep layout | awk '{print $2}')
	for i in "\${!LAYOUTS[@]}"; do
		if [ "\${LAYOUTS[$i]}" = "$CURRENT_LAYOUT" ]; then
			CURRENT=$i
			break
		fi
	done
	NEXT=$(( (CURRENT + 1) % ${numLayouts} ))
	setxkbmap "\${LAYOUTS[$NEXT]}" "\${VARIANTS[$NEXT]}"
fi
`;
	await writeTextFile(scriptPath, scriptContent, { baseDir: HOME });
	const home = await path.homeDir();
	await invoke('set_executable', { path: home + '/' + scriptPath });
}

// ---------- Update keybindings.json with layout cycle bindings ----------
async function updateKeybindings(layoutKeys) {
	const keybindingsPath = CONFIG_DIR + 'keybindings.json';
	let bindings = [];
	try {
		const content = await readTextFile(keybindingsPath, { baseDir: HOME });
		bindings = JSON.parse(content);
	} catch (err) {
		if (!err.toString().includes('No such file or directory')) throw err;
	}
	// Remove any existing bindings for cycle-layout.sh
	bindings = bindings.filter(b => b.command !== '~/.config/MyI3Config/scripts/cycle-layout.sh');
	// Add new bindings for each key
	layoutKeys.forEach(keyCombo => {
		if (keyCombo.trim()) {
			bindings.push({
				keyCombo: keyCombo.trim(),
				type: 'app',
				command: '~/.config/MyI3Config/scripts/cycle-layout.sh'
			});
		}
	});
	await writeTextFile(keybindingsPath, JSON.stringify(bindings, null, 2), { baseDir: HOME });
	await generateKeybindingsConf();
}

// ---------- Ensure input.conf is included in main config ----------
async function ensureIncludeLine() {
	const MAIN_CONFIG_PATH = CONFIG_DIR + 'config';
	try {
		let configContent = '';
		try {
			configContent = await readTextFile(MAIN_CONFIG_PATH, { baseDir: HOME });
		} catch (err) {
			if (!err.toString().includes('No such file or directory')) throw err;
			configContent = '# i3/sway config\n';
		}
		const lines = configContent.split('\n');
		const includeLine = 'include ~/.config/MyI3Config/input.conf';
		const hasInclude = lines.some(line => line.includes('input.conf'));

		if (!hasInclude) {
			const appsIndex = lines.findIndex(line => line.includes('# Applications'));
			if (appsIndex !== -1) {
				lines.splice(appsIndex + 1, 0, '', includeLine);
			} else {
				lines.push('', includeLine);
			}
			await writeTextFile(MAIN_CONFIG_PATH, lines.join('\n'), { baseDir: HOME });
		}
	} catch (error) {
		showStatus('Error updating main config: ' + error, 'error');
	}
}

// ---------- Status helper ----------
function showStatus(msg, type) {
	statusDiv.textContent = msg;
	statusDiv.className = 'status ' + type;
	setTimeout(() => {
		statusDiv.textContent = '';
		statusDiv.className = 'status';
	}, 3000);
}

// ---------- Initialization ----------
export async function init(containerElement) {
	container = containerElement;
	statusDiv = document.getElementById('status');

	// On macOS, show notice that input config isn't managed by AeroSpace
	if (navigator.platform.startsWith('Mac')) {
		container.innerHTML = `
			<h2>Input</h2>
			<div style="padding: 2rem; background: #fff3cd; border-radius: 8px; margin: 1rem 0; border: 1px solid #ffc107;">
				<h3 style="margin-top: 0;">⌨️ Not available on macOS</h3>
				<p>Keyboard repeat rate, mouse/trackpad settings, and layout management are handled by macOS System Settings.</p>
				<p>AeroSpace only supports <code>[key-mapping]</code> preset (qwerty / dvorak / colemak) in <code>~/.aerospace.toml</code>.</p>
				<p>Configure keyboard: <strong>System Settings → Keyboard</strong></p>
				<p>Configure trackpad: <strong>System Settings → Trackpad</strong></p>
			</div>
		`;
		return;
	}

	repeatRateInput = document.getElementById('repeat-rate');
	repeatDelayInput = document.getElementById('repeat-delay');
	accelProfileSelect = document.getElementById('accel-profile');
	accelSpeedInput = document.getElementById('accel-speed');
	naturalScrollCheck = document.getElementById('natural-scroll');
	tapToClickCheck = document.getElementById('tap-to-click');

	// New keyboard elements
	xkbModelInput = document.getElementById('xkb-model');
	xkbOptionsInput = document.getElementById('xkb-options');
	xkbNumlockCheck = document.getElementById('xkb-numlock');

	// Advanced mouse elements
	leftHandedCheck = document.getElementById('left-handed');
	dwtCheck = document.getElementById('dwt');
	scrollMethodSelect = document.getElementById('scroll-method');
	scrollButtonInput = document.getElementById('scroll-button');
	scrollButtonGroup = document.getElementById('scroll-button-group');
	tapButtonMapSelect = document.getElementById('tap-button-map');
	dragLockCheck = document.getElementById('drag-lock');
	middleEmulationCheck = document.getElementById('middle-emulation');
	clickMethodSelect = document.getElementById('click-method');

	layoutListDiv = document.getElementById('layout-list');
	layoutKeysListDiv = document.getElementById('layout-keys-list');

	// Show/hide scroll button based on scroll method
	function updateScrollButtonVisibility() {
		if (scrollButtonGroup) {
			scrollButtonGroup.style.display = scrollMethodSelect.value === 'on_button_down' ? 'block' : 'none';
		}
	}
	scrollMethodSelect.addEventListener('change', updateScrollButtonVisibility);
	updateScrollButtonVisibility();

	document.getElementById('add-layout').addEventListener('click', () => {
		currentSettings.layouts.push({ layout: '', variant: '' });
		renderLayoutList();
	});

	document.getElementById('add-layout-key').addEventListener('click', () => {
		currentSettings.layoutKeys.push('$mod+space'); // default
		renderLayoutKeysList();
	});

	document.getElementById('save-btn').addEventListener('click', saveSettings);

	await loadSettings();
}
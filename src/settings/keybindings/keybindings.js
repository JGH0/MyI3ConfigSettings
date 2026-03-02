// settings/keybindings/keybindings.js
import { listScripts } from '../../configManager.js';

const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;

// ---------- Configuration ----------
const MAIN_CONFIG_PATH = '.config/MyI3Config/config';
const SETTINGS_PATH = '.config/MyI3Config/settings/';
const HOME = BaseDirectory.Home;

// ---------- Module state ----------
let allScripts = [];					 // not directly used, but kept for reference
let originalConfigLines = [];
let bindings = [];						 // each: { keyCombo, scriptName, command, lineIndex }

// DOM elements
let container;
let statusDiv;

// ---------- Helper: parse key combo into modifiers and base key ----------
function parseKeyCombo(combo) {
	const parts = combo.split('+');
	const baseKey = parts.pop(); // last part is the base key
	const modifiers = {
		Ctrl: false,
		Alt: false,
		Shift: false,
		Super: false // $mod
	};
	parts.forEach(p => {
		if (p === 'Ctrl') modifiers.Ctrl = true;
		else if (p === 'Alt') modifiers.Alt = true;
		else if (p === 'Shift') modifiers.Shift = true;
		else if (p === '$mod') modifiers.Super = true;
	});
	return { modifiers, baseKey };
}

// ---------- Helper: build key combo from modifiers and base key ----------
function buildKeyCombo(modifiers, baseKey) {
	const parts = [];
	if (modifiers.Ctrl) parts.push('Ctrl');
	if (modifiers.Alt) parts.push('Alt');
	if (modifiers.Shift) parts.push('Shift');
	if (modifiers.Super) parts.push('$mod');
	parts.push(baseKey);
	return parts.join('+');
}

// ---------- Helper: derive script filename from command ----------
function commandToScriptName(command) {
	// Sanitize: lowercase, replace non-alphanumeric with underscore
	const safe = command.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.sh';
	return safe;
}

// ---------- Load data ----------
async function loadData() {
	try {
		// Read main config (if missing, treat as empty)
		let configContent = '';
		try {
			configContent = await readTextFile(MAIN_CONFIG_PATH, { baseDir: HOME });
		} catch (err) {
			if (!err.toString().includes('No such file or directory')) throw err;
		}
		originalConfigLines = configContent ? configContent.split('\n') : [];

		// Parse bindings and load corresponding script content
		bindings = [];
		const regex = /^bindsym\s+(\S+)\s+exec\s+(?:--no-startup-id\s+)?~\/\.config\/MyI3Config\/settings\/([^\s]+)/;
		for (let i = 0; i < originalConfigLines.length; i++) {
			const line = originalConfigLines[i];
			const match = line.match(regex);
			if (match) {
				const keyCombo = match[1];
				const scriptName = match[2];
				// Read the script file to get the command
				let command = '';
				try {
					const scriptContent = await readTextFile(SETTINGS_PATH + scriptName, { baseDir: HOME });
					command = scriptContent.trim();
				} catch (err) {
					// If script missing, leave command empty (will be shown as warning)
				}
				bindings.push({
					keyCombo,
					scriptName,
					command,
					lineIndex: i
				});
			}
		}

		renderTable();
		statusDiv.textContent = '';
	} catch (error) {
		showStatus('Error loading: ' + error, 'error');
	}
}

// ---------- Render table ----------
function renderTable() {
	let html = `
		<table style="width:100%; border-collapse: collapse;">
			<thead>
				<tr>
					<th>Modifiers</th>
					<th>Key</th>
					<th>Command (e.g., firefox)</th>
					<th></th>
				</tr>
			</thead>
			<tbody id="bindings-tbody">
	`;

	bindings.forEach((b, idx) => {
		const { modifiers, baseKey } = parseKeyCombo(b.keyCombo);
		html += `
			<tr data-index="${idx}">
				<td>
					<label><input type="checkbox" class="mod-ctrl" ${modifiers.Ctrl ? 'checked' : ''}> Ctrl</label>
					<label><input type="checkbox" class="mod-alt" ${modifiers.Alt ? 'checked' : ''}> Alt</label>
					<label><input type="checkbox" class="mod-shift" ${modifiers.Shift ? 'checked' : ''}> Shift</label>
					<label><input type="checkbox" class="mod-super" ${modifiers.Super ? 'checked' : ''}> Super ($mod)</label>
				</td>
				<td>
					<input type="text" class="base-key" value="${baseKey}" placeholder="e.g. Return, a, 1" style="width:100px;" />
					<button class="record-key" data-index="${idx}">🎤</button>
				</td>
				<td>
					<input type="text" class="command" value="${b.command}" placeholder="Program command" style="width:200px;" />
				</td>
				<td>
					<button class="delete-btn" data-index="${idx}">🗑️</button>
				</td>
			</tr>
		`;
	});

	html += `
			<tr id="new-row">
				<td colspan="4" style="text-align: center;">
					<button id="add-binding-btn">➕ Add new binding</button>
				</td>
			</tr>
		</tbody>
	</table>
	<div style="margin-top: 1rem;">
		<button id="save-all-btn">💾 Save All Changes</button>
	</div>
	`;

	container.innerHTML = html;

	// Attach event listeners
	document.querySelectorAll('.record-key').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const index = e.target.dataset.index;
			const input = document.querySelector(`tr[data-index="${index}"] .base-key`);
			if (input) startKeyRecording(input);
		});
	});

	document.querySelectorAll('.delete-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const index = e.target.dataset.index;
			deleteBinding(parseInt(index));
		});
	});

	document.getElementById('add-binding-btn').addEventListener('click', () => {
		bindings.push({
			keyCombo: '',
			scriptName: '',
			command: '',
			lineIndex: -1 // new
		});
		renderTable();
	});

	document.getElementById('save-all-btn').addEventListener('click', saveAllBindings);
}

// ---------- Key recording for base key ----------
let activeRecordInput = null;
let recording = false;

function startKeyRecording(inputElement) {
	if (recording) stopKeyRecording();
	activeRecordInput = inputElement;
	recording = true;
	inputElement.value = 'Press a key...';
	document.addEventListener('keydown', handleKeyRecord);
}

function stopKeyRecording() {
	recording = false;
	if (activeRecordInput) activeRecordInput = null;
	document.removeEventListener('keydown', handleKeyRecord);
}

function handleKeyRecord(event) {
	event.preventDefault();
	event.stopPropagation();
	if (!activeRecordInput) return;

	// Ignore modifier keys themselves
	if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta' || event.key === 'OS') {
		return;
	}

	// Map special keys
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
	stopKeyRecording();
}

// ---------- Save all bindings ----------
async function saveAllBindings() {
	// First, collect current data from table
	const rows = document.querySelectorAll('#bindings-tbody tr[data-index]');
	rows.forEach(row => {
		const index = row.dataset.index;
		const modCtrls = row.querySelectorAll('.mod-ctrl');
		const modAlts = row.querySelectorAll('.mod-alt');
		const modShifts = row.querySelectorAll('.mod-shift');
		const modSupers = row.querySelectorAll('.mod-super');
		const baseKeyInput = row.querySelector('.base-key');
		const commandInput = row.querySelector('.command');

		if (modCtrls.length && baseKeyInput && commandInput) {
			// Assume one of each per row
			const modifiers = {
				Ctrl: modCtrls[0].checked,
				Alt: modAlts[0].checked,
				Shift: modShifts[0].checked,
				Super: modSupers[0].checked
			};
			const baseKey = baseKeyInput.value.trim();
			const command = commandInput.value.trim();

			if (baseKey && command) {
				const keyCombo = buildKeyCombo(modifiers, baseKey);
				bindings[index].keyCombo = keyCombo;
				bindings[index].command = command;
			} else {
				// If incomplete, mark for deletion? We'll skip saving this row
				bindings[index].keyCombo = '';
				bindings[index].command = '';
			}
		}
	});

	// Create/update script files and build new config lines
	const newLines = [];
	let bindingIdx = 0;

	for (let i = 0; i < originalConfigLines.length; i++) {
		const line = originalConfigLines[i];
		if (bindingIdx < bindings.length && bindings[bindingIdx].lineIndex === i) {
			const b = bindings[bindingIdx];
			if (b.keyCombo && b.command) {
				// Derive script name from command
				const scriptName = commandToScriptName(b.command);
				// Write script file
				try {
					await writeTextFile(SETTINGS_PATH + scriptName, b.command, { baseDir: HOME });
				} catch (err) {
					showStatus(`Error writing script ${scriptName}: ${err}`, 'error');
				}
				// Add config line
				newLines.push(`bindsym ${b.keyCombo} exec ~/.config/MyI3Config/settings/${scriptName}`);
			}
			bindingIdx++;
		} else {
			newLines.push(line);
		}
	}

	// Add new bindings (lineIndex = -1)
	for (let b of bindings) {
		if (b.lineIndex === -1 && b.keyCombo && b.command) {
			const scriptName = commandToScriptName(b.command);
			try {
				await writeTextFile(SETTINGS_PATH + scriptName, b.command, { baseDir: HOME });
			} catch (err) {
				showStatus(`Error writing script ${scriptName}: ${err}`, 'error');
			}
			newLines.push(`bindsym ${b.keyCombo} exec ~/.config/MyI3Config/settings/${scriptName}`);
		}
	}

	// Write config file
	try {
		await writeTextFile(MAIN_CONFIG_PATH, newLines.join('\n'), { baseDir: HOME });
		showStatus('Changes saved.', 'success');
		await loadData(); // reload to refresh line indices
	} catch (error) {
		showStatus('Error saving config: ' + error, 'error');
	}
}

// ---------- Delete binding ----------
async function deleteBinding(index) {
	if (!confirm('Delete this keybinding?')) return;
	bindings.splice(index, 1);
	await saveAllBindings();
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
export function init(containerElement) {
	container = containerElement;
	statusDiv = document.getElementById('status');
	loadData();
}
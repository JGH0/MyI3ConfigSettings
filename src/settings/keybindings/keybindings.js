// settings/keybindings/keybindings.js
import { readKeybindings, writeKeybindings, generateConfLines, writeConfFile, ensureIncludeLine, writeAerospaceKeybindings } from '../../configManager.js';

const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const JSON_PATH = CONFIG_DIR + 'keybindings.json';
const KEYBINDS_CONF = CONFIG_DIR + 'keybindings.conf';
const MAIN_CONFIG_PATH = CONFIG_DIR + 'config';
const HOME = BaseDirectory.Home;

// ---------- Module state ----------
let bindings = [];
let filteredBindings = [];
let container;
let statusDiv;

// Search/filter state
let searchTerm = '';
let typeFilter = 'all';
let sortAscending = true;

// References to filter elements
let searchInput, typeSelect, sortBtn;

// Available window actions
const WINDOW_ACTIONS = [
	'kill',
	'fullscreen toggle',
	'floating toggle',
	'split toggle',
	'focus left',
	'focus down',
	'focus up',
	'focus right',
	'move left; move cursor to window',
	'move down; move cursor to window',
	'move up; move cursor to window',
	'move right; move cursor to window',
	'resize shrink width 10 px or 10 ppt',
	'resize grow height 10 px or 10 ppt',
	'resize shrink height 10 px or 10 ppt',
	'resize grow width 10 px or 10 ppt',
	'reload',
	'restart'
];

// Workspace numbers 1-10 (0 = workspace 10)
const WORKSPACE_NUMBERS = [1,2,3,4,5,6,7,8,9,0];

// Resize directions and units
const RESIZE_DIRECTIONS = [
	'shrink width',
	'grow width',
	'shrink height',
	'grow height'
];
const RESIZE_UNITS = ['px', 'ppt'];

// ---------- Helper: parse key combo ----------
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

// ---------- Load bindings from JSON ----------
async function loadBindings() {
	try {
		let content = '';
		try {
			content = await readTextFile(JSON_PATH, { baseDir: HOME });
		} catch (err) {
			if (!err.toString().includes('No such file or directory')) throw err;
		}
		bindings = content ? JSON.parse(content) : [];
		// Migrate old bindings (without type) to application type
		bindings = bindings
			.filter(b => b.keyCombo && (
				(b.type === 'app' && b.command) ||
				(b.type === 'window' && b.action) ||
				(b.type === 'workspace' && b.workspaceNum !== undefined) ||
				(b.type === 'move-to-workspace' && b.workspaceNum !== undefined) ||
				(b.type === 'resize' && b.resizeDir && b.resizeAmount !== undefined && b.resizeUnit)
			))
			.map(b => {
				if (!b.type) {
					return { ...b, type: 'app', command: b.command };
				}
				return b;
			});
		applyFilterAndSort();
	} catch (error) {
		showStatus('Error loading bindings: ' + error, 'error');
		bindings = [];
		filteredBindings = [];
	}
}

// ---------- Filter and sort bindings ----------
function applyFilterAndSort() {
	filteredBindings = bindings.filter(b => {
		if (typeFilter !== 'all' && b.type !== typeFilter) return false;
		if (searchTerm) {
			const term = searchTerm.toLowerCase();
			const keyComboMatch = b.keyCombo.toLowerCase().includes(term);
			let detailMatch = false;
			if (b.type === 'app') {
				detailMatch = b.command?.toLowerCase().includes(term);
			} else if (b.type === 'window') {
				detailMatch = b.action?.toLowerCase().includes(term);
			} else if (b.type === 'workspace' || b.type === 'move-to-workspace') {
				detailMatch = String(b.workspaceNum).includes(term);
			} else if (b.type === 'resize') {
				detailMatch = `${b.resizeDir} ${b.resizeAmount} ${b.resizeUnit}`.toLowerCase().includes(term);
			}
			if (!keyComboMatch && !detailMatch) return false;
		}
		return true;
	});

	filteredBindings.sort((a, b) => {
		const typeA = a.type || '';
		const typeB = b.type || '';
		if (typeA < typeB) return sortAscending ? -1 : 1;
		if (typeA > typeB) return sortAscending ? 1 : -1;
		return 0;
	});
	renderTableBody();
}

// ---------- Write current bindings to disk ----------
async function writeBindingsToDisk() {
	try {
		await writeKeybindings(bindings);

		if (window.IS_MAC) {
			// macOS: write AeroSpace TOML bindings
			await writeAerospaceKeybindings(bindings);
			showStatus('Changes saved to ~/.aerospace.toml. Reload AeroSpace with ⌘⇧r', 'success');
		} else {
			// Linux: generate i3/sway bindsym conf
			const confLines = bindings.map(b => {
				if (b.type === 'app') {
					return `bindsym ${b.keyCombo} exec ${b.command}`;
				} else if (b.type === 'window') {
					return `bindsym ${b.keyCombo} ${b.action}`;
				} else if (b.type === 'workspace') {
					return `bindsym ${b.keyCombo} workspace ${b.workspaceNum === 0 ? 10 : b.workspaceNum}`;
				} else if (b.type === 'move-to-workspace') {
					return `bindsym ${b.keyCombo} move container to workspace ${b.workspaceNum === 0 ? 10 : b.workspaceNum}`;
				} else if (b.type === 'resize') {
					return `bindsym ${b.keyCombo} resize ${b.resizeDir} ${b.resizeAmount} ${b.resizeUnit}`;
				}
				return '';
			}).filter(line => line);
			await writeConfFile(confLines);
			await ensureIncludeLine();
			showStatus('Changes saved. Reload i3/sway with $mod+Shift+c', 'success');
		}
	} catch (error) {
		showStatus('Error saving: ' + error, 'error');
	}
}

// ---------- Delete binding ----------
function deleteBinding(index) {
	if (index < 0 || index >= filteredBindings.length) return;
	const bindingToDelete = filteredBindings[index];
	const originalIndex = bindings.findIndex(b => 
		b.keyCombo === bindingToDelete.keyCombo &&
		b.type === bindingToDelete.type &&
		(b.command === bindingToDelete.command || b.action === bindingToDelete.action)
	);
	if (originalIndex !== -1) {
		bindings.splice(originalIndex, 1);
		applyFilterAndSort();
	}
}

// ---------- Render table body ----------
function renderTableBody() {
	let tableHtml = `
		<table style="width:100%; border-collapse: collapse;">
			<thead>
				<tr>
					<th>Modifiers</th>
					<th>Key</th>
					<th>Type</th>
					<th>Details</th>
					<th></th>
				</tr>
			</thead>
			<tbody id="bindings-tbody">
	`;

	filteredBindings.forEach((b, idx) => {
		const { modifiers, baseKey } = parseKeyCombo(b.keyCombo);
		const type = b.type || 'app';

		tableHtml += `
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
					<select class="type-select" data-index="${idx}">
						<option value="app" ${type === 'app' ? 'selected' : ''}>Application</option>
						<option value="window" ${type === 'window' ? 'selected' : ''}>Window Action</option>
						<option value="workspace" ${type === 'workspace' ? 'selected' : ''}>Switch Workspace</option>
						<option value="move-to-workspace" ${type === 'move-to-workspace' ? 'selected' : ''}>Move to Workspace</option>
						<option value="resize" ${type === 'resize' ? 'selected' : ''}>Resize</option>
					</select>
				</td>
				<td class="dynamic-field">
					${renderDetailsField(b, idx)}
				</td>
				<td>
					<button class="delete-btn" data-index="${idx}">🗑️</button>
				</td>
			</tr>
		`;
	});

	tableHtml += `
			</tbody>
		</table>
	`;

	const tbodyContainer = document.getElementById('bindings-table-container');
	if (tbodyContainer) {
		tbodyContainer.innerHTML = tableHtml;
	}

	// Attach event listeners for live updates
	attachRowEventListeners();
}

// Helper to render details field (returns HTML string)
function renderDetailsField(binding, index) {
	const type = binding.type || 'app';
	if (type === 'app') {
		const command = binding.command || '';
		return `<input type="text" class="command" data-index="${index}" value="${command.replace(/"/g, '&quot;')}" placeholder="Program command" style="width:200px;" />`;
	} else if (type === 'window') {
		const action = binding.action || WINDOW_ACTIONS[0];
		return `<select class="action-select" data-index="${index}" style="width:200px;">
			${WINDOW_ACTIONS.map(a => `<option value="${a}" ${a === action ? 'selected' : ''}>${a}</option>`).join('')}
		</select>`;
	} else if (type === 'workspace' || type === 'move-to-workspace') {
		const workspaceNum = binding.workspaceNum !== undefined ? binding.workspaceNum : 1;
		return `<select class="workspace-num" data-index="${index}" style="width:100px;">
			${WORKSPACE_NUMBERS.map(n => `<option value="${n}" ${n === workspaceNum ? 'selected' : ''}>${n === 0 ? '10' : n}</option>`).join('')}
		</select>`;
	} else if (type === 'resize') {
		const dir = binding.resizeDir || RESIZE_DIRECTIONS[0];
		const amount = binding.resizeAmount !== undefined ? binding.resizeAmount : 10;
		const unit = binding.resizeUnit || 'px';
		return `
			<select class="resize-dir" data-index="${index}" style="width:120px;">
				${RESIZE_DIRECTIONS.map(d => `<option value="${d}" ${d === dir ? 'selected' : ''}>${d}</option>`).join('')}
			</select>
			<input type="number" class="resize-amount" data-index="${index}" value="${amount}" min="1" max="100" style="width:60px;" />
			<select class="resize-unit" data-index="${index}" style="width:60px;">
				${RESIZE_UNITS.map(u => `<option value="${u}" ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}
			</select>
		`;
	}
	return '';
}

// Attach event listeners to all input/select elements in the table
function attachRowEventListeners() {
	// Modifier checkboxes
	document.querySelectorAll('.mod-ctrl, .mod-alt, .mod-shift, .mod-super').forEach(cb => {
		cb.addEventListener('change', (e) => {
			const row = e.target.closest('tr');
			if (!row) return;
			const index = row.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (!binding) return;
			// Rebuild keyCombo from current modifiers and base key
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
				binding.keyCombo = buildKeyCombo(modifiers, baseKey);
			}
		});
	});

	// Base key input
	document.querySelectorAll('.base-key').forEach(input => {
		input.addEventListener('input', (e) => {
			const row = e.target.closest('tr');
			if (!row) return;
			const index = row.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (!binding) return;
			const baseKey = e.target.value.trim();
			if (!baseKey) return;
			const modCtrls = row.querySelectorAll('.mod-ctrl');
			const modAlts = row.querySelectorAll('.mod-alt');
			const modShifts = row.querySelectorAll('.mod-shift');
			const modSupers = row.querySelectorAll('.mod-super');
			const modifiers = {
				Ctrl: modCtrls[0]?.checked || false,
				Alt: modAlts[0]?.checked || false,
				Shift: modShifts[0]?.checked || false,
				Super: modSupers[0]?.checked || false
			};
			binding.keyCombo = buildKeyCombo(modifiers, baseKey);
		});
	});

	// Type select
	document.querySelectorAll('.type-select').forEach(select => {
		select.addEventListener('change', (e) => {
			const row = e.target.closest('tr');
			if (!row) return;
			const index = row.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (!binding) return;
			const newType = e.target.value;
			binding.type = newType;
			// Reset fields for new type
			if (newType === 'app') {
				binding.command = binding.command || '';
				delete binding.action;
				delete binding.workspaceNum;
				delete binding.resizeDir;
				delete binding.resizeAmount;
				delete binding.resizeUnit;
			} else if (newType === 'window') {
				binding.action = binding.action || WINDOW_ACTIONS[0];
				delete binding.command;
				delete binding.workspaceNum;
				delete binding.resizeDir;
				delete binding.resizeAmount;
				delete binding.resizeUnit;
			} else if (newType === 'workspace' || newType === 'move-to-workspace') {
				binding.workspaceNum = binding.workspaceNum !== undefined ? binding.workspaceNum : 1;
				delete binding.command;
				delete binding.action;
				delete binding.resizeDir;
				delete binding.resizeAmount;
				delete binding.resizeUnit;
			} else if (newType === 'resize') {
				binding.resizeDir = binding.resizeDir || RESIZE_DIRECTIONS[0];
				binding.resizeAmount = binding.resizeAmount !== undefined ? binding.resizeAmount : 10;
				binding.resizeUnit = binding.resizeUnit || 'px';
				delete binding.command;
				delete binding.action;
				delete binding.workspaceNum;
			}
			// Re-render just this row's details field
			const dynamicCell = row.querySelector('.dynamic-field');
			dynamicCell.innerHTML = renderDetailsField(binding, index);
			// Re-attach listeners (simple: re-attach all for the whole table)
			attachRowEventListeners();
		});
	});

	// Details fields (command, action, workspace, resize) – use event delegation or direct listeners
	// Command input
	document.querySelectorAll('.command').forEach(input => {
		input.addEventListener('input', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && binding.type === 'app') {
				binding.command = e.target.value;
			}
		});
	});

	// Action select
	document.querySelectorAll('.action-select').forEach(select => {
		select.addEventListener('change', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && binding.type === 'window') {
				binding.action = e.target.value;
			}
		});
	});

	// Workspace number select
	document.querySelectorAll('.workspace-num').forEach(select => {
		select.addEventListener('change', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && (binding.type === 'workspace' || binding.type === 'move-to-workspace')) {
				binding.workspaceNum = parseInt(e.target.value, 10);
			}
		});
	});

	// Resize direction
	document.querySelectorAll('.resize-dir').forEach(select => {
		select.addEventListener('change', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && binding.type === 'resize') {
				binding.resizeDir = e.target.value;
			}
		});
	});

	// Resize amount
	document.querySelectorAll('.resize-amount').forEach(input => {
		input.addEventListener('input', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && binding.type === 'resize') {
				binding.resizeAmount = parseInt(e.target.value, 10) || 0;
			}
		});
	});

	// Resize unit
	document.querySelectorAll('.resize-unit').forEach(select => {
		select.addEventListener('change', (e) => {
			const index = e.target.dataset.index;
			if (index === undefined) return;
			const binding = filteredBindings[index];
			if (binding && binding.type === 'resize') {
				binding.resizeUnit = e.target.value;
			}
		});
	});

	// Record key buttons (already have listener)
	document.querySelectorAll('.record-key').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const index = e.currentTarget.dataset.index;
			const input = document.querySelector(`tr[data-index="${index}"] .base-key`);
			if (input) startKeyRecording(input);
		});
	});

	// Delete buttons
	document.querySelectorAll('.delete-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const indexStr = e.currentTarget.dataset.index;
			if (!indexStr) return;
			const idx = parseInt(indexStr, 10);
			if (isNaN(idx) || idx < 0 || idx >= filteredBindings.length) return;
			deleteBinding(idx);
		});
	});
}

// ---------- Key recording ----------
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
	// Trigger input event to update binding
	const inputEvent = new Event('input', { bubbles: true });
	activeRecordInput.dispatchEvent(inputEvent);
	stopKeyRecording();
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

	const controlsHtml = `
		<div style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center;">
			<input type="text" id="search-input" placeholder="Search key combo or command..." value="${searchTerm}" style="flex: 1; padding: 0.3rem;" />
			<select id="type-filter">
				<option value="all" ${typeFilter === 'all' ? 'selected' : ''}>All types</option>
				<option value="app" ${typeFilter === 'app' ? 'selected' : ''}>Application</option>
				<option value="window" ${typeFilter === 'window' ? 'selected' : ''}>Window Action</option>
				<option value="workspace" ${typeFilter === 'workspace' ? 'selected' : ''}>Switch Workspace</option>
				<option value="move-to-workspace" ${typeFilter === 'move-to-workspace' ? 'selected' : ''}>Move to Workspace</option>
				<option value="resize" ${typeFilter === 'resize' ? 'selected' : ''}>Resize</option>
			</select>
			<button id="sort-btn">Sort by Type ${sortAscending ? '⬆️' : '⬇️'}</button>
		</div>
		<div id="bindings-table-container"></div>
		<div style="margin-top: 1rem;">
			<button id="add-binding-btn">➕ Add new binding</button>
			<button id="save-all-btn">💾 Save All Changes</button>
		</div>
	`;
	container.innerHTML = controlsHtml;

	searchInput = document.getElementById('search-input');
	typeSelect = document.getElementById('type-filter');
	sortBtn = document.getElementById('sort-btn');

	searchInput.addEventListener('input', (e) => {
		searchTerm = e.target.value;
		applyFilterAndSort();
	});

	typeSelect.addEventListener('change', (e) => {
		typeFilter = e.target.value;
		applyFilterAndSort();
	});

	sortBtn.addEventListener('click', () => {
		sortAscending = !sortAscending;
		applyFilterAndSort();
	});

	document.getElementById('add-binding-btn').addEventListener('click', () => {
		bindings.push({ keyCombo: '', type: 'app', command: '' });
		applyFilterAndSort();
	});

	document.getElementById('save-all-btn').addEventListener('click', writeBindingsToDisk);

	await loadBindings();
}
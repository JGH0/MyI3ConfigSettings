/**
 * @module configManager
 * Provides reusable functions for managing i3/sway and AeroSpace configuration.
 */

if (!window.__TAURI__) {
	throw new Error('Tauri global object not found. Make sure this module is loaded inside a Tauri window.');
}

const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;

const HOME = BaseDirectory.Home;
const CONFIG_DIR = '.config/MyI3Config/';
const JSON_PATH = CONFIG_DIR + 'keybindings.json';
const KEYBINDS_CONF = CONFIG_DIR + 'keybindings.conf';
const MAIN_CONFIG_PATH = CONFIG_DIR + 'config';

// AeroSpace paths (macOS only)
const AEROSPACE_CONFIG = '.aerospace.toml';

// ----- Platform detection -----
const IS_MAC = navigator.platform.startsWith('Mac');

// ----- Modifier mapping -----
function translateModToAerospace(modifiers, baseKey) {
	// $mod → cmd on macOS
	const parts = [];
	if (modifiers.Ctrl) parts.push('ctrl');
	if (modifiers.Alt) parts.push('alt');
	if (modifiers.Shift) parts.push('shift');
	if (modifiers.Super) parts.push('cmd');
	parts.push(baseKey);
	return parts.join('-').toLowerCase();
}

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

// ----- i3/sway generation -----

/**
 * Reads the keybindings JSON file.
 * @returns {Promise<Array>} Array of binding objects { keyCombo, command }.
 */
export async function readKeybindings() {
	try {
		const content = await readTextFile(JSON_PATH, { baseDir: HOME });
		return JSON.parse(content).filter(b => b.keyCombo && b.command);
	} catch (err) {
		if (err.toString().includes('No such file or directory')) {
			return [];
		}
		throw err;
	}
}

/**
 * Writes keybindings to the JSON file.
 * @param {Array} bindings - Array of binding objects.
 */
export async function writeKeybindings(bindings) {
	await writeTextFile(JSON_PATH, JSON.stringify(bindings, null, 2), { baseDir: HOME });
}

/**
 * Generates the bindsym lines for the configuration snippet.
 * @param {Array} bindings - Array of binding objects.
 * @returns {string[]} Array of lines like "bindsym $mod+Return exec firefox".
 */
export function generateConfLines(bindings) {
	return bindings.map(b => `bindsym ${b.keyCombo} exec ${b.command}`);
}

/**
 * Writes the keybindings.conf snippet file.
 * @param {string[]} lines - Array of bindsym lines.
 */
export async function writeConfFile(lines) {
	await writeTextFile(KEYBINDS_CONF, lines.join('\n'), { baseDir: HOME });
}

/**
 * Ensures the main config includes the snippet file.
 * Adds an 'include' line if missing (after the # Applications section or at the end).
 */
export async function ensureIncludeLine() {
	let configContent = '';
	try {
		configContent = await readTextFile(MAIN_CONFIG_PATH, { baseDir: HOME });
	} catch (err) {
		if (!err.toString().includes('No such file or directory')) throw err;
		configContent = '# i3/sway config\n';
	}
	const lines = configContent.split('\n');
	const includeLine = 'include ~/.config/MyI3Config/keybindings.conf';
	const hasInclude = lines.some(line => line.includes('keybindings.conf'));

	if (!hasInclude) {
		const appsIndex = lines.findIndex(line => line.includes('# Applications'));
		if (appsIndex !== -1) {
			lines.splice(appsIndex + 1, 0, '', includeLine);
		} else {
			lines.push('', includeLine);
		}
		await writeTextFile(MAIN_CONFIG_PATH, lines.join('\n'), { baseDir: HOME });
	}
}

/**
 * Generate i3/sway keybindings.conf from keybindings.json
 */
export async function generateKeybindingsConf() {
	try {
		const content = await readTextFile(JSON_PATH, { baseDir: HOME });
		const bindings = JSON.parse(content);
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
		await writeTextFile(KEYBINDS_CONF, confLines.join('\n'), { baseDir: HOME });
	} catch (err) {
		console.error('Failed to generate keybindings.conf:', err);
	}
}

// ----- AeroSpace (macOS) generation -----

/**
 * Convert a single i3-style binding to an AeroSpace TOML binding entry.
 */
function bindingToAerospaceLine(b) {
	const { modifiers, baseKey } = parseKeyCombo(b.keyCombo);
	const aerospaceKey = translateModToAerospace(modifiers, baseKey);
	let aeroCommand = '';

	if (b.type === 'app') {
		aeroCommand = `exec-and-forget ${b.command}`;
	} else if (b.type === 'window') {
		// Map i3/sway window actions to AeroSpace commands
		const actionMap = {
			'kill': 'close',
			'fullscreen toggle': 'fullscreen',
			'floating toggle': 'layout floating tiling',
			'split toggle': 'layout tiles horizontal vertical accordion',
			'focus left': 'focus left',
			'focus down': 'focus down',
			'focus up': 'focus up',
			'focus right': 'focus right',
			'move left; move cursor to window': 'move left',
			'move down; move cursor to window': 'move down',
			'move up; move cursor to window': 'move up',
			'move right; move cursor to window': 'move right',
			'resize shrink width 10 px or 10 ppt': 'resize width -50',
			'resize grow height 10 px or 10 ppt': 'resize height +50',
			'resize shrink height 10 px or 10 ppt': 'resize height -50',
			'resize grow width 10 px or 10 ppt': 'resize width +50',
			'reload': 'reload-config',
			'restart': 'reload-config'
		};
		aeroCommand = actionMap[b.action] || b.action;
	} else if (b.type === 'workspace') {
		const wsNum = b.workspaceNum === 0 ? 10 : b.workspaceNum;
		aeroCommand = `workspace ${wsNum}`;
	} else if (b.type === 'move-to-workspace') {
		const wsNum = b.workspaceNum === 0 ? 10 : b.workspaceNum;
		aeroCommand = `move-node-to-workspace ${wsNum}`;
	} else if (b.type === 'resize') {
		// Convert i3 resize direction to AeroSpace resize
		const dir = b.resizeDir || 'grow width';
		const amount = b.resizeAmount || 50;
		if (dir.includes('width')) {
			aeroCommand = `resize width ${dir.startsWith('grow') ? '+' : '-'}${amount}`;
		} else {
			aeroCommand = `resize height ${dir.startsWith('grow') ? '+' : '-'}${amount}`;
		}
	}

	return `  ${aerospaceKey} = '${aeroCommand}'`;
}

/**
 * Read existing AeroSpace config from ~/.aerospace.toml
 */
async function readAerospaceConfig() {
	try {
		const content = await readTextFile(AEROSPACE_CONFIG, { baseDir: HOME });
		return content;
	} catch (err) {
		if (err.toString().includes('No such file or directory')) {
			return null;
		}
		throw err;
	}
}

/**
 * Write updated AeroSpace config with new keybindings.
 * Preserves everything outside the [mode.main.binding] section.
 */
export async function writeAerospaceKeybindings(bindings) {
	let existing = await readAerospaceConfig();

	if (!existing) {
		// Create a minimal config from template
		existing = `# AeroSpace Configuration
# Generated by MyI3ConfigSettings
config-version = 2
start-at-login = true

enable-normalization-flatten-containers = true
enable-normalization-opposite-orientation-for-nested-containers = true

default-root-container-layout = 'tiles'
default-root-container-orientation = 'auto'
accordion-padding = 30

[gaps]
inner.horizontal = 0
inner.vertical = 0
outer.left = 0
outer.bottom = 0
outer.top = 0
outer.right = 0

on-focused-monitor-changed = ['move-mouse monitor-lazy-center']
automatically-unhide-macos-hidden-apps = true
persistent-workspaces = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

[key-mapping]
preset = 'qwerty'

[mode.main.binding]
  # Keybindings will be inserted here
`;
	}

	// Generate TOML binding lines
	const aeroLines = bindings
		.filter(b => b.keyCombo)
		.map(b => bindingToAerospaceLine(b));

	// Replace the [mode.main.binding] section
	const lines = existing.split('\n');
	const result = [];
	let inBindingSection = false;
	let bindingSectionReplaced = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.trim().startsWith('[mode.main.binding]') || line.trim().startsWith('[mode."main".binding]')) {
			// Start of binding section — add the header and our bindings
			result.push(line);
			result.push('');
			for (const aeroLine of aeroLines) {
				result.push(aeroLine);
			}
			result.push('');
			inBindingSection = true;
			bindingSectionReplaced = true;
			continue;
		}

		if (inBindingSection) {
			// Skip lines until we hit a new section or end of file
			if (line.trim().startsWith('[') && !line.trim().startsWith('[mode.main.binding]')) {
				// Next section — add the line and exit binding section
				result.push(line);
				inBindingSection = false;
			}
			// Otherwise skip (it was part of the old binding section)
			continue;
		}

		result.push(line);
	}

	// If no [mode.main.binding] section existed, append one
	if (!bindingSectionReplaced) {
		result.push('');
		result.push('[mode.main.binding]');
		result.push('');
		for (const aeroLine of aeroLines) {
			result.push(aeroLine);
		}
	}

	await writeTextFile(AEROSPACE_CONFIG, result.join('\n'), { baseDir: HOME });
}

/**
 * Get the binding type filter categories (platform-aware)
 */
export function getBindingTypeFilters() {
	const types = [
		{ value: 'all', label: 'All types' },
		{ value: 'app', label: 'Application' },
		{ value: 'window', label: 'Window Action' },
		{ value: 'workspace', label: 'Switch Workspace' },
		{ value: 'move-to-workspace', label: 'Move to Workspace' },
		{ value: 'resize', label: 'Resize' }
	];
	return types;
}

export { IS_MAC, parseKeyCombo };

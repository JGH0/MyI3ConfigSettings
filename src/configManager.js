/**
 * @module configManager
 * Provides reusable functions for managing i3/sway configuration and keybindings.
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

export async function generateKeybindingsConf() {
	const { readTextFile, writeTextFile, BaseDirectory } = window.__TAURI__.fs;
	const HOME = BaseDirectory.Home;
	const KEYBINDINGS_JSON = '.config/MyI3Config/keybindings.json';
	const KEYBINDS_CONF = '.config/MyI3Config/keybindings.conf';
	try {
		const content = await readTextFile(KEYBINDINGS_JSON, { baseDir: HOME });
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
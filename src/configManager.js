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
/**
 * @module configManager
 * @description Provides functions to manage i3/sway config scripts located in `~/.config/MyI3Config/settings/`.
 * Uses Tauri's file system plugin. Assumes the necessary permissions are granted in the capability file.
 */

// Ensure Tauri global object is available
if (!window.__TAURI__) {
	throw new Error('Tauri global object not found. Make sure this module is loaded inside a Tauri window.');
}

const { fs } = window.__TAURI__;
const { readDir, readTextFile, writeTextFile, remove, BaseDirectory } = fs;

/**
 * Base directory for all operations – the user's home directory.
 * @type {BaseDirectory.Home}
 */
const BASE_DIR = BaseDirectory.Home;

/**
 * Relative path to the settings folder inside the user's home.
 * @type {string}
 */
const SETTINGS_PATH = '.config/MyI3Config/settings/';

/**
 * Validates a filename to prevent path traversal attacks.
 * Only allows alphanumeric characters, dashes, underscores, and the `.sh` extension.
 * @param {string} filename - The filename to validate.
 * @throws {Error} If the filename is invalid.
 */
function validateFilename(filename) {
	if (typeof filename !== 'string') {
		throw new Error('Filename must be a string.');
	}
	// Only allow safe characters: letters, numbers, dash, underscore, and must end with .sh
	const safePattern = /^[a-zA-Z0-9_-]+\.sh$/;
	if (!safePattern.test(filename)) {
		throw new Error(`Invalid filename: "${filename}". Only alphanumeric, dash, underscore and .sh extension are allowed.`);
	}
}

/**
 * Builds the full relative path for a given filename inside the settings directory.
 * @param {string} filename - The filename (e.g., "terminal.sh").
 * @returns {string} The full relative path (e.g., ".config/MyI3Config/settings/terminal.sh").
 */
function buildPath(filename) {
	return SETTINGS_PATH + filename;
}

/**
 * Lists all `.sh` files in the settings directory.
 * @returns {Promise<string[]>} A promise that resolves to an array of filenames.
 * @throws Will throw an error if the directory cannot be read.
 */
export async function listScripts() {
	try {
		const entries = await readDir(SETTINGS_PATH, { baseDir: BASE_DIR });
		// Filter for files with .sh extension (ignore directories)
		const scriptFiles = entries
			.filter(entry => entry.name && entry.name.endsWith('.sh') && !entry.children)
			.map(entry => entry.name);
		return scriptFiles;
	} catch (error) {
		throw new Error(`Failed to list scripts: ${error}`);
	}
}

/**
 * Reads the content of a script file.
 * @param {string} filename - The name of the script file (e.g., "terminal.sh").
 * @returns {Promise<string>} A promise that resolves to the file content.
 * @throws Will throw an error if the filename is invalid, the file cannot be read, or does not exist.
 */
export async function readScript(filename) {
	validateFilename(filename);
	try {
		const path = buildPath(filename);
		const content = await readTextFile(path, { baseDir: BASE_DIR });
		return content;
	} catch (error) {
		throw new Error(`Failed to read script "${filename}": ${error}`);
	}
}

/**
 * Writes content to a script file. If the file does not exist, it will be created.
 * @param {string} filename - The name of the script file.
 * @param {string} content - The content to write.
 * @returns {Promise<void>}
 * @throws Will throw an error if the filename is invalid or the write operation fails.
 */
export async function writeScript(filename, content) {
	validateFilename(filename);
	if (typeof content !== 'string') {
		throw new Error('Content must be a string.');
	}
	try {
		const path = buildPath(filename);
		await writeTextFile(path, content, { baseDir: BASE_DIR });
	} catch (error) {
		throw new Error(`Failed to write script "${filename}": ${error}`);
	}
}

/**
 * Deletes a script file.
 * @param {string} filename - The name of the script file.
 * @returns {Promise<void>}
 * @throws Will throw an error if the filename is invalid, the file does not exist, or deletion fails.
 */
export async function deleteScript(filename) {
	validateFilename(filename);
	try {
		const path = buildPath(filename);
		await remove(path, { baseDir: BASE_DIR });
	} catch (error) {
		throw new Error(`Failed to delete script "${filename}": ${error}`);
	}
}

/**
 * Creates a new script file with the given content. If the file already exists, it will be overwritten.
 * This is essentially an alias for `writeScript`.
 * @param {string} filename - The name of the script file.
 * @param {string} content - The initial content.
 * @returns {Promise<void>}
 * @throws Will throw an error if the filename is invalid or the write operation fails.
 */
export async function createScript(filename, content) {
	return writeScript(filename, content);
}
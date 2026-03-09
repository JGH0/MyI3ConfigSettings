// settings/autostart/autostart.js
const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, mkdir, BaseDirectory } = fs;
const { invoke } = window.__TAURI__.core;
const { path } = window.__TAURI__;

const SCRIPTS_DIR = '.config/MyI3Config/scripts/';
const STARTUP_SCRIPT = SCRIPTS_DIR + 'startup.sh';
const HOME = BaseDirectory.Home;

let textarea;
let saveBtn;
let statusDiv;

async function loadStartupScript() {
	try {
		let content = '';
		try {
			content = await readTextFile(STARTUP_SCRIPT, { baseDir: HOME });
		} catch (err) {
			if (!err.toString().includes('No such file or directory')) throw err;
			// Default content if file doesn't exist
			content = '#!/bin/bash\n# Add your startup commands here\n';
		}
		textarea.value = content;
	} catch (error) {
		showStatus('Error loading startup script: ' + error, 'error');
	}
}

async function saveStartupScript() {
	const content = textarea.value.trim();
	if (!content) {
		showStatus('Script cannot be empty.', 'error');
		return;
	}
	try {
		// Ensure scripts directory exists
		await mkdir(SCRIPTS_DIR, { baseDir: HOME, recursive: true });

		// Write the file
		await writeTextFile(STARTUP_SCRIPT, content, { baseDir: HOME });

		// Make it executable
		const homePath = await path.homeDir();
		const fullPath = homePath + '/' + STARTUP_SCRIPT;
		await invoke('set_executable', { path: fullPath });

		showStatus('Startup script saved and made executable.', 'success');
	} catch (error) {
		showStatus('Error saving: ' + error, 'error');
	}
}

function showStatus(msg, type) {
	statusDiv.textContent = msg;
	statusDiv.className = 'status ' + type;
	setTimeout(() => {
		statusDiv.textContent = '';
		statusDiv.className = 'status';
	}, 3000);
}

export function init(containerElement) {
	// Get references to the elements (they are now in the DOM)
	textarea = document.getElementById('startupScript');
	saveBtn = document.getElementById('saveBtn');
	statusDiv = document.getElementById('status');

	if (!textarea || !saveBtn || !statusDiv) {
		console.error('Required elements not found in autostart.html');
		return;
	}

	saveBtn.addEventListener('click', saveStartupScript);
	loadStartupScript();
}
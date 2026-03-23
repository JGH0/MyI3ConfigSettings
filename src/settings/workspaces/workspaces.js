import { generateKeybindingsConf } from '../../configManager.js'; // only if needed

const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;
const { invoke } = window.__TAURI__.core;
const { path } = window.__TAURI__;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const WORKSPACES_JSON = CONFIG_DIR + 'workspaces.json';
const WORKSPACES_CONF = CONFIG_DIR + 'workspaces.conf';
const HOME = BaseDirectory.Home;

// Default workspaces (1-10)
const DEFAULT_WORKSPACES = {
    names: {
        1: '1',
        2: '2',
        3: '3',
        4: '4',
        5: '5',
        6: '6',
        7: '7',
        8: '8',
        9: '9',
        10: '10'
    },
    assignments: [] // array of { appClass, workspace }
};

let currentSettings = { ...DEFAULT_WORKSPACES };
let container, statusDiv;
let assignmentsContainer;

// ---------- Load settings ----------
async function loadSettings() {
    try {
        let content = '';
        try {
            content = await readTextFile(WORKSPACES_JSON, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
        }
        if (content) {
            const saved = JSON.parse(content);
            currentSettings = { ...DEFAULT_WORKSPACES, ...saved };
            if (!currentSettings.names) currentSettings.names = DEFAULT_WORKSPACES.names;
            if (!currentSettings.assignments) currentSettings.assignments = [];
        } else {
            currentSettings = JSON.parse(JSON.stringify(DEFAULT_WORKSPACES));
        }
        renderUI();
    } catch (error) {
        showStatus('Error loading settings: ' + error, 'error');
    }
}

// ---------- Render UI ----------
function renderUI() {
    renderWorkspaceNames();
    renderAssignments();
}

function renderWorkspaceNames() {
    const tbody = document.getElementById('workspace-names-body');
    tbody.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i === 10 ? '0 (10)' : i}</td>
            <td><input type="text" class="ws-name" data-ws="${i}" value="${currentSettings.names[i] || i}" style="width:200px;" /></td>
        `;
        tbody.appendChild(tr);
    }
    // Attach event listeners
    document.querySelectorAll('.ws-name').forEach(input => {
        input.addEventListener('change', (e) => {
            const ws = e.target.dataset.ws;
            currentSettings.names[ws] = e.target.value.trim() || ws;
        });
    });
}

function renderAssignments() {
    assignmentsContainer.innerHTML = '';
    currentSettings.assignments.forEach((assign, idx) => {
        const div = document.createElement('div');
        div.className = 'assignment-item';
        div.style.marginBottom = '0.5rem';
        div.style.display = 'flex';
        div.style.gap = '0.5rem';
        div.style.alignItems = 'center';
        div.innerHTML = `
            <input type="text" class="app-class" data-index="${idx}" value="${assign.appClass}" placeholder="Application class (e.g., Firefox)" style="width:200px;" />
            <select class="workspace-select" data-index="${idx}">
                ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${assign.workspace == n ? 'selected' : ''}>${n === 10 ? '10' : n}</option>`).join('')}
            </select>
            <button class="remove-assignment" data-index="${idx}">🗑️</button>
        `;
        assignmentsContainer.appendChild(div);
    });

    // Attach listeners
    document.querySelectorAll('.app-class').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            currentSettings.assignments[idx].appClass = e.target.value;
        });
    });
    document.querySelectorAll('.workspace-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            currentSettings.assignments[idx].workspace = parseInt(e.target.value, 10);
        });
    });
    document.querySelectorAll('.remove-assignment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            currentSettings.assignments.splice(idx, 1);
            renderAssignments();
        });
    });
}

// ---------- Save settings ----------
async function saveSettings() {
    // Gather current data from UI (already in currentSettings via listeners, but ensure sync)
    // Workspace names are already updated via change events; assignments already updated.
    try {
        await writeTextFile(WORKSPACES_JSON, JSON.stringify(currentSettings, null, 2), { baseDir: HOME });

        // Generate workspaces.conf
        const confLines = [];

        // Workspace names
        for (let i = 1; i <= 10; i++) {
            const name = currentSettings.names[i];
            if (name && name !== i.toString()) {
                confLines.push(`workspace ${i} name "${name}"`);
            }
        }

        // Assignments
        currentSettings.assignments.forEach(assign => {
            if (assign.appClass && assign.workspace) {
                confLines.push(`assign [class="${assign.appClass}"] workspace ${assign.workspace}`);
            }
        });

        await writeTextFile(WORKSPACES_CONF, confLines.join('\n'), { baseDir: HOME });

        // Ensure include line in main config
        await ensureIncludeLine();

        showStatus('Workspace settings saved. Reload i3/sway with $mod+Shift+c', 'success');
    } catch (error) {
        showStatus('Error saving: ' + error, 'error');
    }
}

// ---------- Ensure workspaces.conf is included in main config ----------
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
        const includeLine = 'include ~/.config/MyI3Config/workspaces.conf';
        const hasInclude = lines.some(line => line.includes('workspaces.conf'));

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
    assignmentsContainer = document.getElementById('assignments-list');

    document.getElementById('add-assignment').addEventListener('click', () => {
        currentSettings.assignments.push({ appClass: '', workspace: 1 });
        renderAssignments();
    });

    document.getElementById('save-btn').addEventListener('click', saveSettings);

    await loadSettings();
}
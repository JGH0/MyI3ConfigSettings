// settings/keybindings/keybindings.js
const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const JSON_PATH = CONFIG_DIR + 'keybindings.json';
const KEYBINDS_CONF = CONFIG_DIR + 'keybindings.conf';  // generated snippet
const MAIN_CONFIG_PATH = CONFIG_DIR + 'config';
const HOME = BaseDirectory.Home;

// ---------- Module state ----------
let bindings = [];
let container;
let statusDiv;

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
        bindings = bindings.filter(b => b.keyCombo && b.command);
    } catch (error) {
        showStatus('Error loading bindings: ' + error, 'error');
        bindings = [];
    }
}

// ---------- Ensure include line exists in main config ----------
async function ensureIncludeLine() {
    try {
        let configContent = '';
        try {
            configContent = await readTextFile(MAIN_CONFIG_PATH, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
            // Config doesn't exist – create it with include line
            configContent = '# i3/sway config\n';
        }
        const lines = configContent.split('\n');
        const includeLine = 'include ~/.config/MyI3Config/keybindings.conf';

        // Check if include line already exists (maybe with different path)
        const hasInclude = lines.some(line => line.includes('keybindings.conf'));

        if (!hasInclude) {
            // Find a good place to insert – after the Applications section or at the end
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

// ---------- Save bindings: write JSON and generate keybindings.conf ----------
async function saveAllBindings() {
    // Collect data from table
    const rows = document.querySelectorAll('#bindings-tbody tr[data-index]');
    const newBindings = [];
    rows.forEach(row => {
        const modCtrls = row.querySelectorAll('.mod-ctrl');
        const modAlts = row.querySelectorAll('.mod-alt');
        const modShifts = row.querySelectorAll('.mod-shift');
        const modSupers = row.querySelectorAll('.mod-super');
        const baseKeyInput = row.querySelector('.base-key');
        const commandInput = row.querySelector('.command');

        if (modCtrls.length && baseKeyInput && commandInput) {
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
                newBindings.push({ keyCombo, command });
            }
        }
    });

    bindings = newBindings;

    try {
        // Write JSON
        await writeTextFile(JSON_PATH, JSON.stringify(bindings, null, 2), { baseDir: HOME });

        // Generate keybindings.conf content
        const confLines = bindings.map(b => `bindsym ${b.keyCombo} exec ${b.command}`);
        await writeTextFile(KEYBINDS_CONF, confLines.join('\n'), { baseDir: HOME });

        // Ensure main config includes the snippet
        await ensureIncludeLine();

        showStatus('Changes saved. Reload i3/sway with $mod+Shift+c', 'success');
        await loadBindings(); // reload to keep UI in sync
        renderTable();
    } catch (error) {
        showStatus('Error saving: ' + error, 'error');
    }
}

// ---------- Delete binding ----------
async function deleteBinding(index) {
    if (!confirm('Delete this keybinding?')) return;
    bindings.splice(index, 1);
    await saveAllBindings();
}

// ---------- Render table (same as before) ----------
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

    // Attach event listeners (same as before)
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
        bindings.push({ keyCombo: '', command: '' });
        renderTable();
    });

    document.getElementById('save-all-btn').addEventListener('click', saveAllBindings);
}

// ---------- Key recording (same as before) ----------
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
    await loadBindings();
    renderTable();
}
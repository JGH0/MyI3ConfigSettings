// settings/themes/themes.js
const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;
const { dialog } = window.__TAURI__;
const { path } = window.__TAURI__;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const THEME_JSON = CONFIG_DIR + 'theme.json';
const THEME_CONF = CONFIG_DIR + 'theme.conf';
const STARTUP_SCRIPT = CONFIG_DIR + 'scripts/startup.sh';
const LOCK_SCRIPT = CONFIG_DIR + 'scripts/lock.sh';
const HOME = BaseDirectory.Home;

// Default theme values
const DEFAULT_THEME = {
    font: 'JetBrains Mono 10',
    gapsInner: 0,
    gapsOuter: 0,
    borderWidth: 2,
    colors: {
        focused: { border: '#4c7899', background: '#285577', text: '#ffffff', indicator: '#2e9ef4' },
        unfocused: { border: '#333333', background: '#222222', text: '#888888' },
        urgent: { border: '#2f343a', background: '#900000', text: '#ffffff' }
    },
    wallpaper: '',
    lockImage: ''
};

let currentTheme = { ...DEFAULT_THEME };
let container, statusDiv;

// DOM elements
let fontInput, gapsInner, gapsOuter, borderWidth;
let focusedBorder, focusedBg, focusedText, focusedIndicator;
let unfocusedBorder, unfocusedBg, unfocusedText;
let urgentBorder, urgentBg, urgentText;
let wallpaperInput, lockImageInput;

// ---------- Load theme from JSON ----------
async function loadTheme() {
    try {
        let content = '';
        try {
            content = await readTextFile(THEME_JSON, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
        }
        if (content) {
            const saved = JSON.parse(content);
            currentTheme = { ...DEFAULT_THEME, ...saved };
            // Merge colors carefully
            if (saved.colors) {
                currentTheme.colors = {
                    ...DEFAULT_THEME.colors,
                    ...saved.colors
                };
            }
        } else {
            currentTheme = { ...DEFAULT_THEME };
        }
        updateUI();
    } catch (error) {
        showStatus('Error loading theme: ' + error, 'error');
    }
}

// ---------- Update UI from currentTheme ----------
function updateUI() {
    fontInput.value = currentTheme.font || '';
    gapsInner.value = currentTheme.gapsInner || 0;
    gapsOuter.value = currentTheme.gapsOuter || 0;
    borderWidth.value = currentTheme.borderWidth || 2;

    focusedBorder.value = currentTheme.colors.focused.border;
    focusedBg.value = currentTheme.colors.focused.background;
    focusedText.value = currentTheme.colors.focused.text;
    focusedIndicator.value = currentTheme.colors.focused.indicator;

    unfocusedBorder.value = currentTheme.colors.unfocused.border;
    unfocusedBg.value = currentTheme.colors.unfocused.background;
    unfocusedText.value = currentTheme.colors.unfocused.text;

    urgentBorder.value = currentTheme.colors.urgent.border;
    urgentBg.value = currentTheme.colors.urgent.background;
    urgentText.value = currentTheme.colors.urgent.text;

    wallpaperInput.value = currentTheme.wallpaper || '';
    lockImageInput.value = currentTheme.lockImage || '';
}

// ---------- Gather UI values into object ----------
function gatherTheme() {
    return {
        font: fontInput.value.trim(),
        gapsInner: parseInt(gapsInner.value, 10) || 0,
        gapsOuter: parseInt(gapsOuter.value, 10) || 0,
        borderWidth: parseInt(borderWidth.value, 10) || 2,
        colors: {
            focused: {
                border: focusedBorder.value,
                background: focusedBg.value,
                text: focusedText.value,
                indicator: focusedIndicator.value
            },
            unfocused: {
                border: unfocusedBorder.value,
                background: unfocusedBg.value,
                text: unfocusedText.value
            },
            urgent: {
                border: urgentBorder.value,
                background: urgentBg.value,
                text: urgentText.value
            }
        },
        wallpaper: wallpaperInput.value.trim(),
        lockImage: lockImageInput.value.trim()
    };
}

// ---------- Save theme ----------
async function saveTheme() {
    const newTheme = gatherTheme();
    currentTheme = newTheme;

    try {
        // Write theme.json
        await writeTextFile(THEME_JSON, JSON.stringify(newTheme, null, 2), { baseDir: HOME });

        // Generate theme.conf
        const confLines = [];

        // Font
        if (newTheme.font) {
            confLines.push(`font pango:${newTheme.font}`);
        }

        // Gaps (i3-gaps / sway)
        if (newTheme.gapsInner > 0 || newTheme.gapsOuter > 0) {
            confLines.push(`gaps inner ${newTheme.gapsInner}`);
            confLines.push(`gaps outer ${newTheme.gapsOuter}`);
        }

        // Border width
        if (newTheme.borderWidth !== 2) {
            confLines.push(`default_border pixel ${newTheme.borderWidth}`);
        }

        // Colors
        const c = newTheme.colors;
        confLines.push(
            `client.focused ${c.focused.border} ${c.focused.background} ${c.focused.text} ${c.focused.indicator}`,
            `client.unfocused ${c.unfocused.border} ${c.unfocused.background} ${c.unfocused.text}`,
            `client.urgent ${c.urgent.border} ${c.urgent.background} ${c.urgent.text}`
        );

        await writeTextFile(THEME_CONF, confLines.join('\n'), { baseDir: HOME });

        // Modify startup.sh for wallpaper
        await updateStartupScript(newTheme.wallpaper);

        // Modify lock.sh for lock image
        await updateLockScript(newTheme.lockImage);

        // Ensure main config includes theme.conf (if not already)
        await ensureIncludeLine();

        showStatus('Theme saved. Reload i3/sway with $mod+Shift+c', 'success');
    } catch (error) {
        showStatus('Error saving theme: ' + error, 'error');
    }
}

// ---------- Update startup.sh with wallpaper ----------
async function updateStartupScript(wallpaperPath) {
    try {
        let content = '';
        try {
            content = await readTextFile(STARTUP_SCRIPT, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
            // Create default if missing
            content = '#!/bin/bash\n# Startup script\n';
        }

        const lines = content.split('\n');
        const wallpaperMarker = '# --- WALLPAPER SET BY THEME MANAGER ---';
        const wallpaperLine = wallpaperPath ? `feh --bg-scale "${wallpaperPath}"` : '';

        // Remove any existing wallpaper lines marked by us
        const filteredLines = lines.filter(line => !line.includes(wallpaperMarker));

        if (wallpaperLine) {
            // Insert after shebang or at top
            filteredLines.splice(1, 0, wallpaperMarker, wallpaperLine);
        }

        await writeTextFile(STARTUP_SCRIPT, filteredLines.join('\n'), { baseDir: HOME });
        // Make executable
        const home = await path.homeDir();
        await invoke('set_executable', { path: home + '/' + STARTUP_SCRIPT });
    } catch (error) {
        showStatus('Error updating startup script: ' + error, 'error');
    }
}

// ---------- Update lock.sh with lock image ----------
async function updateLockScript(lockImagePath) {
    try {
        let content = '';
        try {
            content = await readTextFile(LOCK_SCRIPT, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
            // Create default if missing
            content = '#!/bin/bash\nif [ -n "$SWAYSOCK" ]; then\n    swaylock\nelse\n    i3lock\nfi\n';
        }

        const lines = content.split('\n');
        // We'll replace the lines that call swaylock/i3lock with versions that include the image argument.
        // This is a bit crude but works for simple scripts. We'll look for lines containing "swaylock" or "i3lock".
        const newLines = [];
        let modified = false;
        for (let line of lines) {
            if (line.includes('swaylock') && !line.includes('#')) {
                if (lockImagePath) {
                    newLines.push(`    swaylock --image "${lockImagePath}"`);
                } else {
                    newLines.push(`    swaylock`);
                }
                modified = true;
            } else if (line.includes('i3lock') && !line.includes('#')) {
                if (lockImagePath) {
                    newLines.push(`    i3lock -i "${lockImagePath}"`);
                } else {
                    newLines.push(`    i3lock`);
                }
                modified = true;
            } else {
                newLines.push(line);
            }
        }

        if (!modified) {
            // If no lock lines found, append appropriate ones at the end? We'll assume they exist.
            console.warn('No lock command found in lock.sh; not modified.');
        }

        await writeTextFile(LOCK_SCRIPT, newLines.join('\n'), { baseDir: HOME });
        // Make executable
        const home = await path.homeDir();
        await invoke('set_executable', { path: home + '/' + LOCK_SCRIPT });
    } catch (error) {
        showStatus('Error updating lock script: ' + error, 'error');
    }
}

// ---------- Ensure theme.conf is included in main config ----------
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
        const includeLine = 'include ~/.config/MyI3Config/theme.conf';
        const hasInclude = lines.some(line => line.includes('theme.conf'));

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

// ---------- File picker helpers ----------
async function selectFile() {
    const selected = await dialog.open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }]
    });
    return selected || '';
}

// ---------- Reset to defaults ----------
function resetToDefaults() {
    currentTheme = { ...DEFAULT_THEME };
    updateUI();
    showStatus('Defaults loaded. Click Save to apply.', 'info');
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

    // Get element references
    fontInput = document.getElementById('font');
    gapsInner = document.getElementById('gaps-inner');
    gapsOuter = document.getElementById('gaps-outer');
    borderWidth = document.getElementById('border-width');

    focusedBorder = document.getElementById('focused-border');
    focusedBg = document.getElementById('focused-bg');
    focusedText = document.getElementById('focused-text');
    focusedIndicator = document.getElementById('focused-indicator');

    unfocusedBorder = document.getElementById('unfocused-border');
    unfocusedBg = document.getElementById('unfocused-bg');
    unfocusedText = document.getElementById('unfocused-text');

    urgentBorder = document.getElementById('urgent-border');
    urgentBg = document.getElementById('urgent-bg');
    urgentText = document.getElementById('urgent-text');

    wallpaperInput = document.getElementById('wallpaper');
    lockImageInput = document.getElementById('lock-image');

    // Buttons
    document.getElementById('select-wallpaper').addEventListener('click', async () => {
        const file = await selectFile();
        if (file) wallpaperInput.value = file;
    });
    document.getElementById('select-lock').addEventListener('click', async () => {
        const file = await selectFile();
        if (file) lockImageInput.value = file;
    });

    document.getElementById('save-btn').addEventListener('click', saveTheme);
    document.getElementById('reset-btn').addEventListener('click', resetToDefaults);

    await loadTheme();
}
// settings/themes/themes.js
const { fs } = window.__TAURI__;
const { readTextFile, writeTextFile, BaseDirectory } = fs;
const { dialog } = window.__TAURI__;
const { path } = window.__TAURI__;
const { invoke } = window.__TAURI__.core;
const { Command } = window.__TAURI__.shell;

// ---------- Configuration ----------
const CONFIG_DIR = '.config/MyI3Config/';
const THEME_JSON = CONFIG_DIR + 'theme.json';
const THEME_CONF = CONFIG_DIR + 'theme.conf';
const THEME_STARTUP_SCRIPT = CONFIG_DIR + 'scripts/theme-startup.sh';
const LOCK_SCRIPT = CONFIG_DIR + 'scripts/lock.sh';
const HOME = BaseDirectory.Home;

// Default theme values
const DEFAULT_THEME = {
    font: 'JetBrains Mono 10',
    gapsInner: 0,
    gapsOuter: 0,
    colors: {
        focused: { border: '#4c7899', background: '#285577', text: '#ffffff', indicator: '#2e9ef4' },
        unfocused: { border: '#333333', background: '#222222', text: '#888888' },
        urgent: { border: '#2f343a', background: '#900000', text: '#ffffff' }
    },
    borderStyle: 'pixel',
    borderPixelWidth: 1,
    floatingModifier: '$mod',
    focusFollowsMouse: 'yes',
    wallpaperType: 'static',   // new: 'static' or 'animated'
    wallpaper: '',
    lockImage: ''
};

let currentTheme = { ...DEFAULT_THEME };
let container, statusDiv, fontPreview, wallpaperWarning;

// DOM elements
let fontInput, gapsInner, gapsOuter;
let focusedBorder, focusedBg, focusedText, focusedIndicator;
let unfocusedBorder, unfocusedBg, unfocusedText;
let urgentBorder, urgentBg, urgentText;
let borderStyle, borderPixelWidth, floatingModifier, focusFollowsMouse;
let wallpaperType, wallpaperInput, lockImageInput;

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

    borderStyle.value = currentTheme.borderStyle || 'pixel';
    borderPixelWidth.value = currentTheme.borderPixelWidth !== undefined ? currentTheme.borderPixelWidth : 1;
    floatingModifier.value = currentTheme.floatingModifier || '$mod';
    focusFollowsMouse.value = currentTheme.focusFollowsMouse || 'yes';

    wallpaperType.value = currentTheme.wallpaperType || 'static';
    wallpaperInput.value = currentTheme.wallpaper || '';
    lockImageInput.value = currentTheme.lockImage || '';

    updateFontPreview();
    updateWallpaperWarning();
}

// ---------- Update font preview ----------
function updateFontPreview() {
    if (!fontPreview) return;
    const fontValue = fontInput.value.trim();
    let family = fontValue;
    const lastSpace = fontValue.lastIndexOf(' ');
    if (lastSpace !== -1) {
        const afterSpace = fontValue.substring(lastSpace + 1);
        if (/^\d+$/.test(afterSpace)) {
            family = fontValue.substring(0, lastSpace);
        }
    }
    fontPreview.style.fontFamily = family;
}

// ---------- Update wallpaper warning based on type ----------
function updateWallpaperWarning() {
    if (!wallpaperWarning) return;
    if (wallpaperType.value === 'animated') {
        wallpaperWarning.textContent = 'Animated wallpapers require `mpvpaper` (sway) or `xwinwrap + mpv` (i3). Install them manually.';
    } else {
        wallpaperWarning.textContent = '';
    }
}

// ---------- Ensure font string includes a size ----------
function ensureFontSize(fontString) {
    if (!fontString) return '';
    if (/\d+$/.test(fontString)) return fontString;
    return fontString + ' 10';
}

// ---------- Gather UI values into object ----------
function gatherTheme() {
    return {
        font: ensureFontSize(fontInput.value.trim()),
        gapsInner: parseInt(gapsInner.value, 10) || 0,
        gapsOuter: parseInt(gapsOuter.value, 10) || 0,
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
        borderStyle: borderStyle.value,
        borderPixelWidth: parseInt(borderPixelWidth.value, 10) || 1,
        floatingModifier: floatingModifier.value.trim(),
        focusFollowsMouse: focusFollowsMouse.value,
        wallpaperType: wallpaperType.value,
        wallpaper: wallpaperInput.value.trim(),
        lockImage: lockImageInput.value.trim()
    };
}

// ---------- Load fonts for autocomplete ----------
async function loadFonts() {
    try {
        const fonts = await invoke('list_fonts');
        const datalist = document.getElementById('font-suggestions');
        if (!datalist) return;
        datalist.innerHTML = '';
        fonts.slice(0, 500).forEach(font => {
            const option = document.createElement('option');
            option.value = font;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load fonts:', error);
    }
}

// ---------- Run wallpaper script immediately ----------
async function runWallpaperScript() {
    try {
        const home = await path.homeDir();
        const fullPath = home + '/' + THEME_STARTUP_SCRIPT;
        const command = Command.create('sh', ['-c', fullPath]);
        await command.execute();
        console.log('Wallpaper script executed');
    } catch (error) {
        console.error('Failed to run wallpaper script:', error);
    }
}

// ---------- Write theme-startup.sh (handles wallpaper) ----------
async function writeThemeStartupScript(wallpaperPath, wallpaperType) {
    let scriptContent = '#!/bin/bash\n';
    scriptContent += '# Theme startup script – generated by i3/sway settings manager\n';
    scriptContent += '# Sets wallpaper based on current session and type\n\n';

    if (wallpaperType === 'static') {
        scriptContent += `if [ -n "$SWAYSOCK" ]; then
    # Sway static
    killall swaybg 2>/dev/null
    swaybg -i "${wallpaperPath}" -m fill &
else
    # i3 static
    feh --bg-scale "${wallpaperPath}"
fi
`;
    } else {
        // animated
        scriptContent += `if [ -n "$SWAYSOCK" ]; then
    # Sway animated (mpvpaper)
    if command -v mpvpaper >/dev/null 2>&1; then
        killall mpvpaper 2>/dev/null
        mpvpaper -o "loop" '*' "${wallpaperPath}" &
    else
        echo "mpvpaper not installed; falling back to static."
        killall swaybg 2>/dev/null
        swaybg -i "${wallpaperPath}" -m fill &
    fi
else
    # i3 animated (xwinwrap + mpv)
    if command -v xwinwrap >/dev/null 2>&1 && command -v mpv >/dev/null 2>&1; then
        killall xwinwrap 2>/dev/null
        xwinwrap -g $(xrandr | grep current | awk '{print $8}') -ni -s -nf -b -un -argb -fdt -- mpv -wid WID --loop --no-audio --really-quiet "${wallpaperPath}" &
    else
        echo "xwinwrap or mpv not installed; falling back to static."
        feh --bg-scale "${wallpaperPath}"
    fi
fi
`;
    }

    await writeTextFile(THEME_STARTUP_SCRIPT, scriptContent, { baseDir: HOME });
    const home = await path.homeDir();
    await invoke('set_executable', { path: home + '/' + THEME_STARTUP_SCRIPT });
}

// ---------- Update lock.sh with lock image ----------
async function updateLockScript(lockImagePath) {
    try {
        let content = '';
        try {
            content = await readTextFile(LOCK_SCRIPT, { baseDir: HOME });
        } catch (err) {
            if (!err.toString().includes('No such file or directory')) throw err;
            content = '#!/bin/bash\nif [ -n "$SWAYSOCK" ]; then\n    swaylock\nelse\n    i3lock\nfi\n';
        }

        const lines = content.split('\n');
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
            console.warn('No lock command found in lock.sh; not modified.');
        }

        await writeTextFile(LOCK_SCRIPT, newLines.join('\n'), { baseDir: HOME });
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

// ---------- Save theme ----------
async function saveTheme() {
    const newTheme = gatherTheme();
    currentTheme = newTheme;

    try {
        await writeTextFile(THEME_JSON, JSON.stringify(newTheme, null, 2), { baseDir: HOME });

        const confLines = [];

        if (newTheme.font) {
            confLines.push(`font pango:${newTheme.font}`);
        }

        if (newTheme.gapsInner > 0 || newTheme.gapsOuter > 0) {
            confLines.push(`gaps inner ${newTheme.gapsInner}`);
            confLines.push(`gaps outer ${newTheme.gapsOuter}`);
        }

        // Border style
        if (newTheme.borderStyle === 'pixel') {
            confLines.push(`default_border pixel ${newTheme.borderPixelWidth}`);
        } else {
            confLines.push(`default_border ${newTheme.borderStyle}`);
        }

        // Floating modifier
        confLines.push(`floating_modifier ${newTheme.floatingModifier}`);

        // Focus follows mouse
        confLines.push(`focus_follows_mouse ${newTheme.focusFollowsMouse}`);

        // Colors
        const c = newTheme.colors;
        confLines.push(
            `client.focused ${c.focused.border} ${c.focused.background} ${c.focused.text} ${c.focused.indicator}`,
            `client.unfocused ${c.unfocused.border} ${c.unfocused.background} ${c.unfocused.text}`,
            `client.urgent ${c.urgent.border} ${c.urgent.background} ${c.urgent.text}`
        );

        if (newTheme.wallpaper) {
            await writeThemeStartupScript(newTheme.wallpaper, newTheme.wallpaperType);
            confLines.push(`exec --no-startup-id ~/.config/MyI3Config/scripts/theme-startup.sh`);
        } else {
            try {
                const home = await path.homeDir();
                const fullPath = home + '/' + THEME_STARTUP_SCRIPT;
                await fs.remove(fullPath);
            } catch (err) {
                // ignore
            }
        }

        console.log('Generated theme.conf:\n' + confLines.join('\n'));

        await writeTextFile(THEME_CONF, confLines.join('\n'), { baseDir: HOME });
        await updateLockScript(newTheme.lockImage);
        await ensureIncludeLine();

        // Immediately apply wallpaper if set
        if (newTheme.wallpaper) {
            await runWallpaperScript();
        }

        // Auto-reload i3/sway
        try {
            const cmd = process.env.SWAYSOCK ? 'swaymsg reload' : 'i3-msg reload';
            const [prog, ...args] = cmd.split(' ');
            await Command.create(prog, args).execute();
            showStatus('Theme saved and i3/sway reloaded.', 'success');
        } catch (err) {
            console.warn('Auto-reload failed:', err);
            showStatus('Theme saved. Please reload manually.', 'warning');
        }
    } catch (error) {
        showStatus('Error saving theme: ' + error, 'error');
    }
}

// ---------- File picker helpers ----------
async function selectFile() {
    const extensions = wallpaperType.value === 'animated' 
        ? ['png', 'jpg', 'jpeg', 'bmp', 'gif'] 
        : ['png', 'jpg', 'jpeg', 'bmp'];
    const selected = await dialog.open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Images', extensions }]
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
    wallpaperWarning = document.getElementById('wallpaper-warning');

    // Get element references
    fontInput = document.getElementById('font');
    gapsInner = document.getElementById('gaps-inner');
    gapsOuter = document.getElementById('gaps-outer');

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

    borderStyle = document.getElementById('border-style');
    borderPixelWidth = document.getElementById('border-pixel-width');
    floatingModifier = document.getElementById('floating-modifier');
    focusFollowsMouse = document.getElementById('focus-follows-mouse');

    wallpaperType = document.getElementById('wallpaper-type');
    wallpaperInput = document.getElementById('wallpaper');
    lockImageInput = document.getElementById('lock-image');

    // Create font preview element
    fontPreview = document.createElement('div');
    fontPreview.id = 'font-preview';
    fontPreview.style.marginTop = '4px';
    fontPreview.style.fontSize = '14px';
    fontPreview.textContent = 'AaBbCc 123';
    fontInput.parentNode.insertBefore(fontPreview, fontInput.nextSibling);

    // Buttons
    document.getElementById('select-wallpaper').addEventListener('click', async () => {
        const file = await selectFile();
        if (file) wallpaperInput.value = file;
    });
    document.getElementById('select-lock').addEventListener('click', async () => {
        const selected = await dialog.open({
            directory: false,
            multiple: false,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }]
        });
        if (selected) lockImageInput.value = selected;
    });

    document.getElementById('save-btn').addEventListener('click', saveTheme);
    document.getElementById('reset-btn').addEventListener('click', resetToDefaults);

    // Font preview update on input
    fontInput.addEventListener('input', updateFontPreview);

    // Wallpaper type change: update warning and file picker filters
    wallpaperType.addEventListener('change', updateWallpaperWarning);

    await loadFonts();
    await loadTheme();
}
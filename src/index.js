/**
 * Handles clicks on the settings category list items.
 * Loads the HTML file from the settings subfolder, then imports and runs the JS module.
 */

// Platform detection — stored globally so all modules can check
window.IS_MAC = navigator.platform.startsWith('Mac');

// Which categories are available on each platform
const PLATFORM_CATEGORIES = window.IS_MAC
	? {
		keybindings: 'Keybindings',
		workspaces: 'Workspaces',
		autostart: 'Autostart',
		themes: null,     // not supported on macOS (AeroSpace has no theming)
		input: null        // not supported on macOS (system handles input)
	}
	: {
		keybindings: 'Keybindings',
		themes: 'Themes',
		workspaces: 'Workspaces',
		autostart: 'Autostart',
		input: 'Input'
	};

document.addEventListener('DOMContentLoaded', () => {
	const contentArea = document.getElementById('settingsWindow');
	const settingsList = document.getElementById('settingsList');

	// Build category list based on platform
	settingsList.innerHTML = '';
	for (const [page, label] of Object.entries(PLATFORM_CATEGORIES)) {
		if (label === null) continue;
		const ul = document.createElement('ul');
		ul.dataset.page = page;
		ul.textContent = label;
		settingsList.appendChild(ul);
	}

	const categoryItems = document.querySelectorAll('#settingsList ul');

	async function loadPage(category) {
		try {
			const htmlPath = `./settings/${category}/${category}.html`;
			const response = await fetch(htmlPath);
			if (!response.ok) throw new Error(`Failed to load ${htmlPath}`);
			const html = await response.text();

			contentArea.innerHTML = html;

			const modulePath = `./settings/${category}/${category}.js`;
			const pageModule = await import(modulePath);

			if (pageModule.init && typeof pageModule.init === 'function') {
				pageModule.init(contentArea);
			} else {
				console.warn(`Module ${category}.js has no init function.`);
			}
		} catch (err) {
			contentArea.innerHTML = `<p>Error loading page: ${err.message}</p>`;
			console.error(err);
		}
	}

	categoryItems.forEach(item => {
		item.addEventListener('click', () => {
			categoryItems.forEach(i => i.classList.remove('active'));
			item.classList.add('active');

			const category = item.dataset.page;
			if (category) {
				loadPage(category);
			}
		});
	});

	// Reload button — tries aerospace on macOS, i3-msg/swaymsg on Linux
	const reloadBtn = document.getElementById('reloadBtn');
	if (reloadBtn) {
		reloadBtn.addEventListener('click', async () => {
			try {
				const { Command } = window.__TAURI__.shell;

				if (window.IS_MAC) {
					// macOS AeroSpace reload
					try {
						const command = Command.create('aerospace', ['reload-config']);
						const output = await command.execute();
						if (output.code === 0) {
							console.log('AeroSpace reloaded');
						} else {
							alert('AeroSpace reload failed. Is AeroSpace running?');
						}
					} catch (e) {
						alert('Could not run aerospace command. Make sure AeroSpace is installed and in your PATH.');
					}
				} else {
					// i3/sway reload
					let success = false;
					const commands = ['i3-msg', 'swaymsg'];

					for (const cmd of commands) {
						try {
							const command = Command.create(cmd, ['reload']);
							const output = await command.execute();
							if (output.code === 0) {
								console.log(`Reload succeeded with ${cmd}`);
								success = true;
								break;
							}
						} catch (e) {
							console.log(`${cmd} failed:`, e);
						}
					}

					if (!success) {
						alert('Could not reload i3/sway. Make sure either i3 or sway is installed and the commands are in your PATH.');
					} else {
						console.log('Reload triggered successfully.');
					}
				}
			} catch (error) {
				console.error('Reload failed:', error);
				alert('Could not reload.\nMake sure the shell plugin is enabled and you have the necessary permissions.');
			}
		});
	}
});

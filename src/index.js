/**
 * Handles clicks on the settings category list items.
 * Loads the HTML file from the settings subfolder, then imports and runs the JS module.
 */
document.addEventListener('DOMContentLoaded', () => {
	const contentArea = document.getElementById('settingsWindow');
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
			if (category){
				loadPage(category);
			}
		});
	});

	// Reload button functionality – tries both i3-msg and swaymsg
	const reloadBtn = document.getElementById('reloadBtn');
	if (reloadBtn) {
		reloadBtn.addEventListener('click', async () => {
			try {
				const { Command } = window.__TAURI__.shell;
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
						// Command not found or other error – try the next one
						console.log(`${cmd} failed:`, e);
					}
				}

				if (!success) {
					alert('Could not reload i3/sway. Make sure either i3 or sway is installed and the commands are in your PATH.');
				} else {
					console.log('Reload triggered successfully.');
				}
			} catch (error) {
				console.error('Reload failed:', error);
				alert('Could not reload i3/sway.\nMake sure the shell plugin is enabled and you have the necessary permissions.');
			}
		});
	}
});
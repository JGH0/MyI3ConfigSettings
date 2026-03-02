/**
 * Handles clicks on the settings category list items.
 * Loads the HTML file from the settings subfolder, then imports and runs the JS module.
 */
document.addEventListener('DOMContentLoaded', () => {
	const contentArea = document.getElementById('settingsWindow');
	const categoryItems = document.querySelectorAll('#settingsList ul');

	async function loadPage(category) {
		try {
			// Fetch the HTML file (e.g., settings/keybindings/keybindings.html)
			const htmlPath = `./settings/${category}/${category}.html`;
			const response = await fetch(htmlPath);
			if (!response.ok) throw new Error(`Failed to load ${htmlPath}`);
			const html = await response.text();

			// Insert the HTML into the content area
			contentArea.innerHTML = html;

			// Dynamically import the corresponding JS module
			const modulePath = `./settings/${category}/${category}.js`;
			const pageModule = await import(modulePath);

			// Call the module's init function, passing the contentArea if needed
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

			const category = item.dataset.page; // e.g., "keybindings"
			if (category) loadPage(category);
		});
	});

	// Optionally load a default page
	// loadPage('keybindings');
});
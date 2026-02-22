import { invoke } from "@tauri-apps/api/core";

async function load() {
	const text = await invoke("read_file", {
		path: "/etc/hostname"
	});
	document.getElementById("out").textContent = text;
}

load();
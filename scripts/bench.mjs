// Starts the built site, asks each bench route twice and prints the database queries
// EmDash itself reports in the Server-Timing header (db.count). Run `npm run build` first.
import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "4329";
const base = `http://127.0.0.1:${PORT}`;
const EDITION = process.env.EDITION ?? "2026";
const SPEAKER = process.env.SPEAKER ?? "speaker-7";

const server = spawn(process.execPath, ["./dist/server/entry.mjs"], {
	env: { ...process.env, PORT, HOST: "127.0.0.1" },
	stdio: ["ignore", "ignore", "inherit"],
});

async function waitUp() {
	for (let i = 0; i < 100; i++) {
		try {
			await fetch(`${base}/`);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 200));
		}
	}
	throw new Error("server did not start");
}

function dbCount(res) {
	const m = /db\.count;dur=(\d+)/.exec(res.headers.get("server-timing") ?? "");
	return m ? Number(m[1]) : NaN;
}

async function measure(path) {
	const runs = [];
	for (let i = 0; i < 2; i++) {
		const res = await fetch(`${base}${path}`);
		if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
		const body = await res.json();
		runs.push({ queries: dbCount(res), shown: body.shown, links: body.links, ms: body.ms });
	}
	return runs[1]; // the second run: the process is warm, so start-up reads are not counted
}

try {
	await waitUp();
	const rows = [];
	for (const [label, owner, id] of [
		["Edition page", "editions", EDITION],
		["Speaker page", "speakers", SPEAKER],
	]) {
		for (const mode of ["all-then-filter", "reverse-then-entry", "reverse-only", "reverse-batched-prototype"]) {
			const r = await measure(`/bench/${owner}/${id}/${mode}`);
			rows.push({ page: label, mode, sessions: r.shown, links: r.links, queries: r.queries, "per session": (r.queries / r.shown).toFixed(1), ms: r.ms });
		}
	}
	console.table(rows);
} finally {
	server.kill();
}

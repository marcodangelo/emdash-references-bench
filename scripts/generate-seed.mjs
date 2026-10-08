// Writes seed/seed.json: a fictional conference archive.
// EDITIONS x SESSIONS_PER_EDITION sessions, each linked to one edition, two speakers and one room
// through EmDash relations. Sizes can be changed with environment variables.
import { mkdirSync, writeFileSync } from "node:fs";

const EDITIONS = Number(process.env.EDITIONS ?? 15);
const SESSIONS_PER_EDITION = Number(process.env.SESSIONS_PER_EDITION ?? 130);
const SPEAKERS = Number(process.env.SPEAKERS ?? 300);
const ROOMS = 6;

const title = { slug: "title", label: "Title", type: "string", required: true };
const ref = (slug, relation) => ({ slug, label: slug, type: "reference", validation: { relation } });
const relation = (slug, parentCollection, childCollection, extra = {}) => ({
	slug,
	parentCollection,
	childCollection,
	parentLabel: parentCollection,
	childLabel: childCollection,
	...extra,
});

const seed = {
	$schema: "https://emdashcms.com/seed.schema.json",
	version: "1",
	meta: { name: "References bench", description: "A fictional conference archive." },
	collections: [
		{ slug: "editions", label: "Editions", labelSingular: "Edition", fields: [title, ref("sessions", "sessions_edition")] },
		{ slug: "speakers", label: "Speakers", labelSingular: "Speaker", fields: [title, ref("sessions", "sessions_speakers")] },
		{ slug: "rooms", label: "Rooms", labelSingular: "Room", fields: [title] },
		{
			slug: "sessions",
			label: "Sessions",
			labelSingular: "Session",
			fields: [title, ref("edition", "sessions_edition"), ref("speakers", "sessions_speakers"), ref("room", "sessions_room")],
		},
	],
	relations: [
		relation("sessions_edition", "sessions", "editions", { maxChildrenPerParent: 1 }),
		relation("sessions_speakers", "sessions", "speakers"),
		relation("sessions_room", "sessions", "rooms", { maxChildrenPerParent: 1 }),
	],
	content: { editions: [], speakers: [], rooms: [], sessions: [] },
};

const year0 = 2026 - EDITIONS + 1;
for (let e = 0; e < EDITIONS; e++) {
	const year = year0 + e;
	seed.content.editions.push({ id: `edition-${year}`, slug: String(year), status: "published", data: { title: `Edition ${year}` } });
}
for (let p = 0; p < SPEAKERS; p++) {
	seed.content.speakers.push({ id: `speaker-${p}`, slug: `speaker-${p}`, status: "published", data: { title: `Speaker ${p}` } });
}
for (let r = 0; r < ROOMS; r++) {
	seed.content.rooms.push({ id: `room-${r}`, slug: `room-${r}`, status: "published", data: { title: `Room ${r}` } });
}
let n = 0;
for (let e = 0; e < EDITIONS; e++) {
	for (let s = 0; s < SESSIONS_PER_EDITION; s++, n++) {
		seed.content.sessions.push({
			id: `session-${n}`,
			slug: `session-${n}`,
			status: "published",
			data: {
				title: `Session ${n}`,
				edition: `$ref:edition-${year0 + e}`,
				speakers: [`$ref:speaker-${n % SPEAKERS}`, `$ref:speaker-${(n * 7 + 3) % SPEAKERS}`],
				room: `$ref:room-${n % ROOMS}`,
			},
		});
	}
}

mkdirSync(new URL("../seed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../seed/seed.json", import.meta.url), `${JSON.stringify(seed, null, 1)}\n`);
console.log(`seed/seed.json: ${EDITIONS} editions, ${n} sessions, ${SPEAKERS} speakers, ${ROOMS} rooms`);

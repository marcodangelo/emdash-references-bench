// Three ways to list the sessions of one edition (or one speaker) with their references,
// using only EmDash's public query API. The query count is read from the Server-Timing header.
import { getEmDashCollection, getEmDashEntry, getEmDashReferences } from "emdash";
import { getDb } from "emdash/runtime";
import { sql } from "kysely";

type Owner = "editions" | "speakers";
const PAGE = 100;

/** Every published session, one page of the collection at a time. */
async function allSessions() {
	const out: { id: string }[] = [];
	let cursor: string | undefined;
	do {
		const res = await getEmDashCollection("sessions", { limit: PAGE, ...(cursor ? { cursor } : {}) });
		if (res.error) throw res.error;
		out.push(...res.entries);
		cursor = res.nextCursor;
	} while (cursor);
	return out;
}

/** The entries linked to an edition or a speaker, through the reverse field, a page at a time. */
async function linkedSessions(owner: Owner, ownerId: string) {
	const out: { id: string }[] = [];
	let cursor: string | undefined;
	do {
		const res = await getEmDashReferences(owner, ownerId, "sessions", { limit: PAGE, ...(cursor ? { cursor } : {}) });
		if (res.error) throw res.error;
		out.push(...res.entries);
		cursor = res.nextCursor;
	} while (cursor);
	return out;
}

const idsOf = (page: { entries: { id: string }[] } | undefined) => (page?.entries ?? []).map((e) => e.id);

/** A: read the whole archive, load each session's references, filter in JS. */
export async function allThenFilter(owner: Owner, ownerId: string) {
	const sessions = await allSessions();
	const views = await Promise.all(
		sessions.map(async (s) => {
			const { entry } = await getEmDashEntry("sessions", s.id, {
				references: { edition: true, speakers: true, room: true },
			});
			return entry;
		}),
	);
	const field = owner === "editions" ? "edition" : "speakers";
	const kept = views.filter((e) => e && idsOf(e.references?.[field]).includes(ownerId));
	const others = otherFields(owner);
	return { shown: kept.length, links: kept.reduce((n, e) => n + others.reduce((m, f) => m + idsOf(e?.references?.[f]).length, 0), 0) };
}

/** B: read the owner's sessions through the reverse field, then load each one's other references. */
export async function reverseThenEntry(owner: Owner, ownerId: string) {
	const sessions = await linkedSessions(owner, ownerId);
	const others = otherFields(owner);
	const references = Object.fromEntries(others.map((f) => [f, true]));
	const views = await Promise.all(sessions.map((s) => getEmDashEntry("sessions", s.id, { references })));
	const kept = views.filter((v) => v.entry);
	return { shown: kept.length, links: kept.reduce((n, v) => n + others.reduce((m, f) => m + idsOf(v.entry?.references?.[f]).length, 0), 0) };
}

/** C: the reverse read alone, without the sessions' own references. The floor a batched `references` would build on. */
export async function reverseOnly(owner: Owner, ownerId: string) {
	return { shown: (await linkedSessions(owner, ownerId)).length, links: 0 };
}

const otherFields = (owner: Owner) => (owner === "editions" ? ["speakers", "room"] : ["edition", "room"]);
const relationOf: Record<string, { relation: string; target: string }> = {
	edition: { relation: "sessions_edition", target: "editions" },
	speakers: { relation: "sessions_speakers", target: "speakers" },
	room: { relation: "sessions_room", target: "rooms" },
};
const CHUNK = 50; // EmDash's SQL_BATCH_SIZE
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * D: PROTOTYPE, not public API. The reverse read, then each other reference field loaded for all
 * listed sessions at once: one link query per chunk of 50 parents, with the per-parent limit applied
 * by ROW_NUMBER() OVER (PARTITION BY parent_group), then one target query per chunk of 50 groups.
 * It reads EmDash's internal tables, the way the workarounds in the discussion do, only to measure
 * what a batched `references` option could cost.
 */
export async function reverseBatchedPrototype(owner: Owner, ownerId: string, perParentLimit = 50) {
	const sessions = (await linkedSessions(owner, ownerId)) as unknown as { data: { translationGroup: string } }[];
	const parents = sessions.map((s) => s.data.translationGroup);
	const db = await getDb();
	let links = 0;
	for (const field of otherFields(owner)) {
		const { relation, target } = relationOf[field]!;
		const rel = await sql<{ id: string }>`SELECT id FROM _emdash_relations WHERE slug = ${relation}`.execute(db);
		const relationId = rel.rows[0]!.id;
		const edges: { parent_group: string; child_group: string }[] = [];
		for (const chunk of chunks(parents)) {
			const res = await sql<{ parent_group: string; child_group: string }>`
				SELECT parent_group, child_group FROM (
					SELECT parent_group, child_group, ROW_NUMBER() OVER (PARTITION BY parent_group ORDER BY sort_order, id) AS rn
					FROM _emdash_content_references
					WHERE relation_id = ${relationId} AND parent_group IN (${sql.join(chunk)})
				) WHERE rn <= ${perParentLimit}`.execute(db);
			edges.push(...res.rows);
		}
		const children = [...new Set(edges.map((e) => e.child_group))];
		const found = new Set<string>();
		for (const chunk of chunks(children)) {
			const res = await sql<{ translation_group: string }>`
				SELECT translation_group FROM ${sql.ref(`ec_${target}`)}
				WHERE translation_group IN (${sql.join(chunk)}) AND deleted_at IS NULL AND status = 'published'`.execute(db);
			for (const row of res.rows) found.add(row.translation_group);
		}
		links += edges.filter((e) => found.has(e.child_group)).length;
	}
	return { shown: sessions.length, links };
}

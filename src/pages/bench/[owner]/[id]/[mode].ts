import type { APIRoute } from "astro";
import { allThenFilter, reverseBatchedPrototype, reverseOnly, reverseThenEntry } from "../../../../lib/reads";

const modes = { "all-then-filter": allThenFilter, "reverse-then-entry": reverseThenEntry, "reverse-only": reverseOnly, "reverse-batched-prototype": reverseBatchedPrototype };

export const GET: APIRoute = async ({ params }) => {
	const owner = params.owner;
	const run = modes[params.mode as keyof typeof modes];
	if ((owner !== "editions" && owner !== "speakers") || !run || !params.id) return new Response("not found", { status: 404 });
	const started = performance.now();
	const { shown, links } = await run(owner, params.id);
	return Response.json({ owner, id: params.id, mode: params.mode, shown, links, ms: Math.round(performance.now() - started) });
};

export function parseJson(data: string): unknown {
	try {
		return JSON.parse(data);
	} catch (_error: unknown) {
		return null;
	}
}

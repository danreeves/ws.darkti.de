const sockets = new Set<WebSocket>();
const rooms = new Map<string, Set<WebSocket>>();
const channels = new Map<string, BroadcastChannel>();

function onOpen(ws: WebSocket, room: string) {
	sockets.add(ws);
	if (!rooms.has(room)) {
		rooms.set(room, new Set([ws]));
	} else {
		rooms.get(room)?.add(ws);
	}
	if (!channels.has(room)) {
		const channel = new BroadcastChannel(room)
		channel.onmessage = (event: MessageEvent) => {
			onMessage(null, room, event)
		}
		channels.set(room, channel);
	}
	console.log(`Client connected (${sockets.size} connected to instance)`);
}

function onMessage(ws: WebSocket | null, room: string, message: MessageEvent) {
	if (typeof message.data === "string") {
		console.log(room, message.data);
		const peers = rooms.get(room);
		const channel = channels.get(room);
		for (const peer of peers || []) {
			if (peer !== ws && peer.readyState < 2) {
				peer.send(message.data);
			}
		}
		channel?.postMessage(message.data);
	} else {
		console.warn("Invalid message: ", message.data);
		if (ws && ws.readyState < 2) {
			ws.send(
				JSON.stringify({ type: "error", message: "Invalid event" })
			);
		}
	}
}

function onClose(ws: WebSocket, room: string) {
	sockets.delete(ws);
	rooms.get(room)?.delete(ws);
	console.log(`Client disconnected (${sockets.size} connected to instance)`);
}

function onError(socket: WebSocket, error: Event) { 
	if (error instanceof ErrorEvent) {
		console.error(error.message);
	}
	socket.close();
}

Deno.serve({
	port: 80,
	handler: async (request) => {
		// If the request is a websocket upgrade,
		// we need to use the Deno.upgradeWebSocket helper
		if (request.headers.get("upgrade") === "websocket") {
			const url = new URL(request.url)
			const room = url.pathname.replace(/^\/+|\/+$/g, '')

			if (!room) {
				// If the request is a normal HTTP request,
				// we serve the client HTML file.
				const file = await Deno.open("./index.html", { read: true });
				return new Response(file.readable);
			}
			
			const { socket, response } = Deno.upgradeWebSocket(request);

			socket.onopen = () => onOpen(socket, room);
			socket.onmessage = (message) => onMessage(socket, room, message);
			socket.onclose = () => onClose(socket, room);
			socket.onerror = (error) => onError(socket,  error);

			return response;
		} else {
			// If the request is a normal HTTP request,
			// we serve the client HTML file.
			const file = await Deno.open("./index.html", { read: true });
			return new Response(file.readable);
		}
	},
});

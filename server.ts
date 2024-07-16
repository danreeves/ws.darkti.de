import {
	object,
	union,
	safeParse,
	string,
	literal,
} from "https://deno.land/x/valibot@v0.24.1/mod.ts";

const TWO_MINUTES = 1000 * 60 * 2;

const kv = await Deno.openKv();

const wsToRoom = new Map<WebSocket, string>();
const rooms = new Map<string, WebSocket[]>();
const channels = new Map<string, BroadcastChannel>();
const connectionTimeouts = new Map<WebSocket, number>();

const HeartbeatEvent = object({
	type: literal("doki"),
});

const JoinEvent = object({
	type: literal("join"),
	room: string(),
});

const DataEvent = object({
	type: literal("data"),
	data: string(),
});

const Event = union([HeartbeatEvent, JoinEvent, DataEvent]);

function createTimeout(socket: WebSocket) {
	const connectionTimeout = setTimeout(() => {
		// CONNECTING or OPEN
		if (socket.readyState < 2) {
			console.log("Closing idle connection")
			socket.send(JSON.stringify({type: "sys", message: "idle"}));
			socket.close();
		}
	}, 200);

	connectionTimeouts.set(socket, connectionTimeout);
}

function parseJson(data: string) {
	try {
		return JSON.parse(data);
	} catch (_error: unknown) {
		return null;
	}
}

function onMessage(ws: WebSocket, message: MessageEvent) {
	const data = parseJson(message.data);
	const result = safeParse(Event, data);
	if (result.success) {
		const event = result.output;

		console.log(event);

		switch (event.type) {
			case "doki": {
				// Clear previous timeout
				const connectionTimeout = connectionTimeouts.get(ws);
				if (connectionTimeout) {
					clearTimeout(connectionTimeout);
					connectionTimeouts.delete(ws);
				}

				// Create new timeout
				createTimeout(ws);
				break;
			}

			case "join": {
				// Leave current room
				const currentRoom = wsToRoom.get(ws);
				if (currentRoom) {
					const room = rooms.get(currentRoom);
					if (room) {
						rooms.set(
							currentRoom,
							room.filter((w) => w !== ws)
						);
					}
				}

				// Join new room
				wsToRoom.set(ws, event.room);
				const room = rooms.get(event.room);
				if (room) {
					rooms.set(event.room, [...room, ws]);
				} else {
					rooms.set(event.room, [ws]);
				}

				// Create broadcast channel
				if (!channels.has(event.room)) {
					const channel = new BroadcastChannel(event.room);

					channel.onmessage = (message: MessageEvent<string>) => {
						for (const w of rooms.get(event.room) ?? []) {
							w.send(message.data);
						}
					};

					channels.set(event.room, channel);
				}
				break;
			}

			case "data": {
				const currentRoom = wsToRoom.get(ws);
				if (currentRoom) {
					const channel = channels.get(currentRoom);
					const room = rooms.get(currentRoom);
					if (room) {
						for (const w of room) {
							if (w !== ws) {
								w.send(event.data);
							}
						}
					}
					if (channel) {
						channel.postMessage(event.data);
					}
				}
				break;
			}
		}
	} else {
		console.log(message.data);
		if (ws.readyState < 2) {
			ws.send(JSON.stringify({ type: "sys", message: "Invalid event" }));
		}
	}
}

async function setConnections(change: number) {
	const record = await kv.get<number>(["connections"]);
	const currentConnections = record?.value || 0;
	const connections = currentConnections + change;
	await kv.set(["connections"], connections);
	return connections;
}

async function onOpen() {
	const currentConnections = await setConnections(+1);
	console.log(`Client ${currentConnections} connected`);
}

async function onClose(ws: WebSocket) {
	console.log("onClose")

	// Clear idle timeout
	const connectionTimeout = connectionTimeouts.get(ws);
	if (connectionTimeout) {
		clearTimeout(connectionTimeout);
		connectionTimeouts.delete(ws);
	}

	const currentRoom = wsToRoom.get(ws);
	if (currentRoom) {
		// Leave current room
		const room = rooms.get(currentRoom);
		if (room) {
			const newRoom = room.filter((w) => w !== ws);
			if (newRoom.length === 0) {
				// Delete it if it's empty
				rooms.delete(currentRoom);
				// And close the broadcast channel
				channels.get(currentRoom)?.close();
				channels.delete(currentRoom);
			} else {
				rooms.set(currentRoom, newRoom);
			}
		}
	}

	await setConnections(-1);
	console.log("Client disconnected");
}

function onError(socket: WebSocket, error: Event) {
	console.error(error);
	onClose(socket);
}

Deno.serve({
	port: 80,
	handler: async (request) => {
		// If the request is a websocket upgrade,
		// we need to use the Deno.upgradeWebSocket helper
		if (request.headers.get("upgrade") === "websocket") {
			const { socket, response } = Deno.upgradeWebSocket(request);

			socket.onopen = onOpen;
			socket.onmessage = (message) => onMessage(socket, message);
			socket.onclose = () => onClose(socket);
			socket.onerror = (error) => onError(socket, error);

			createTimeout(socket);

			return response;
		} else {
			// If the request is a normal HTTP request,
			// we serve the client HTML file.
			const file = await Deno.open("./index.html", { read: true });
			return new Response(file.readable);
		}
	},
});

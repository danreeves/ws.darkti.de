import {
	object,
	union,
	safeParse,
	string,
	literal,
} from "https://deno.land/x/valibot@v0.24.1/mod.ts";

const kv = await Deno.openKv();

const wsToRoom = new Map<WebSocket, string>();
const rooms = new Map<string, WebSocket[]>();
const channels = new Map<string, BroadcastChannel>();

const JoinEvent = object({
	type: literal("join"),
	room: string(),
});

const DataEvent = object({
	type: literal("data"),
	data: string(),
});

const Event = union([JoinEvent, DataEvent]);

function onMessage(ws: WebSocket, message: MessageEvent) {
	const result = safeParse(Event, message.data);
	if (result.success) {
		const event = result.output;

		switch (event.type) {
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
		ws.send("Invalid event");
	}
}

async function setConnections(change: number) {
	const record = await kv.get<number>(["connections"]);
	console.log(record);
	const currentConnections = record?.value || 0;
	const connections = currentConnections + change;
	await kv.set(["connections"], connections);
	return connections;
}

setConnections(1);

async function onOpen() {
	const currentConnections = await setConnections(+1);
	console.log(`Client ${currentConnections} connected`);
}

async function onClose(ws: WebSocket) {
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

function onError(error: Event) {
	console.error(error);
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
			socket.onerror = onError;

			return response;
		} else {
			// If the request is a normal HTTP request,
			// we serve the client HTML file.
			const file = await Deno.open("./index.html", { read: true });
			return new Response(file.readable);
		}
	},
});

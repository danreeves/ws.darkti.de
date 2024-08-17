import { safeParse } from "https://deno.land/x/valibot@v0.24.1/mod.ts";
import {
	clearSocket,
	getRoomByRoomId,
	getRoomByUserId,
	getRoomByWebSocket,
	getUserIdByWebSocket,
	registerSocket,
} from "./room.ts";
import { Event } from "./lib/types.ts";
import { parseJson } from "./lib/parseJson.ts";

const sockets = new Set<WebSocket>();

function onMessage(ws: WebSocket, message: MessageEvent) {
	const data = parseJson(message.data);
	const result = safeParse(Event, data);
	if (result.success) {
		const event = result.output;

		console.log(event);

		switch (event.type) {
			case "join": {
				// Ensure socket and user ID are registered
				registerSocket(ws, event.id);

				// Leave current room if in one
				const currentRoom = getRoomByUserId(event.id);
				if (currentRoom) {
					currentRoom.removeMember(event.id);
				}

				// Join new room
				const newRoom = getRoomByRoomId(event.room);
				newRoom.addMember({ id: event.id, mods: event.mods });

				break;
			}

			case "leave": {
				const currentRoom = getRoomByWebSocket(ws);
				const userId = getUserIdByWebSocket(ws);

				if (currentRoom && userId) {
					currentRoom.removeMember(userId);
				}
				break;
			}

			case "data": {
				const currentRoom = getRoomByWebSocket(ws);

				if (currentRoom) {
					currentRoom.sendMessage(event);
				}
				break;
			}
		}
	} else {
		console.warn("Invalid message: ", message.data);
		if (ws.readyState < 2) {
			ws.send(
				JSON.stringify({ type: "error", message: "Invalid event" })
			);
		}
	}
}

function onOpen(ws: WebSocket) {
	sockets.add(ws);
	console.log(`Client connected (${sockets.size} connected to instance)`);
}

function onClose(ws: WebSocket) {
	sockets.delete(ws);

	const currentRoom = getRoomByWebSocket(ws);
	const userId = getUserIdByWebSocket(ws);
	if (currentRoom && userId) {
		currentRoom.removeMember(userId);
	}

	clearSocket(ws);

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
			const { socket, response } = Deno.upgradeWebSocket(request);

			socket.onopen = () => onOpen(socket);
			socket.onmessage = (message) => onMessage(socket, message);
			socket.onclose = () => onClose(socket);
			socket.onerror = (error) => onError(socket, error);

			return response;
		} else {
			// If the request is a normal HTTP request,
			// we serve the client HTML file.
			const file = await Deno.open("./index.html", { read: true });
			return new Response(file.readable);
		}
	},
});

import { Syncable } from "./lib/Syncable.ts";
import type {
	DataEvent,
	JoinedEvent,
	LeftEvent,
	Peer,
	RoomId,
	UserId,
} from "./lib/types.ts";

const rooms = new Map<RoomId, Room>();
const userIdToRoom = new Map<UserId, Room>();
const socketToUserId = new Map<WebSocket, UserId>();
const userIdToSocket = new Map<UserId, WebSocket>();

class Room extends Syncable {
	roomName: RoomId;
	members: Array<Peer> = [];

	constructor(roomName: RoomId) {
		super(roomName);
		this.roomName = roomName;
	}

	addMember(user: Peer) {
		this.members.push(user);
		userIdToRoom.set(user.id, this);
		const socket = userIdToSocket.get(user.id);
		const peers = this.members.filter((member) => member.id !== user.id);

		// Send the new joiner the current members
		if (socket) {
			this.sendMessageToUser(user.id, {
				type: "joined",
				from: "server",
				peers: peers,
			});
		}

		// Send the current members the new joiner
		for (const peer of peers) {
			this.sendMessageToUser(peer.id, {
				type: "joined",
				from: "server",
				peers: [user],
			});
		}
	}

	removeMember(id: UserId) {
		this.members = this.members.filter((m) => m.id !== id);
		userIdToRoom.delete(id);
		if (this.members.length === 0) {
			rooms.delete(this.roomName);
		} else {
			for (const member of this.members) {
				this.sendMessageToUser(member.id, {
					type: "left",
					from: "server",
					id: id,
				});
			}
		}
	}

	private sendMessageToUser(
		userId: UserId,
		message: DataEvent | JoinedEvent | LeftEvent
	) {
		if (userId === message.from) return;

		const user = this.members.find((u) => u.id === userId);
		if (!user) return;

		if ("mod" in message && user.mods && !user.mods.includes(message.mod))
			return;

		const socket = userIdToSocket.get(userId);
		if (!socket) return;

		socket.send(JSON.stringify(message));
	}

	private broadcast(message: DataEvent) {
		for (const member of this.members) {
			this.sendMessageToUser(member.id, message);
		}
	}

	sendMessage(message: DataEvent) {
		if (message.to === "all") {
			this.broadcast(message);
			return;
		}

		for (const userId of message.to) {
			this.sendMessageToUser(userId, message);
		}
	}
}

export function getRoomByRoomId(roomName: RoomId): Room {
	const cachedRoom = rooms.get(roomName);
	if (cachedRoom) {
		return cachedRoom;
	}

	const newRoom = new Room(roomName);
	rooms.set(roomName, newRoom);
	return newRoom;
}

export function getRoomByUserId(id: UserId) {
	return userIdToRoom.get(id);
}

export function getRoomByWebSocket(socket: WebSocket) {
	const userId = socketToUserId.get(socket);

	if (!userId) {
		return;
	}

	return getRoomByUserId(userId);
}

export function getUserIdByWebSocket(socket: WebSocket) {
	return socketToUserId.get(socket);
}

export function registerSocket(socket: WebSocket, id: UserId) {
	userIdToSocket.set(id, socket);
	socketToUserId.set(socket, id);
}

export function clearSocket(socket: WebSocket) {
	const userId = socketToUserId.get(socket);
	if (userId) {
		userIdToSocket.delete(userId);
	}
	socketToUserId.delete(socket);
}

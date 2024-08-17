import { Syncable } from "./lib/Syncable.ts";
import type { DataEvent, RoomId, UserId } from "./lib/types.ts";

const rooms = new Map<RoomId, Room>();
const userIdToRoom = new Map<UserId, Room>();
const socketToUserId = new Map<WebSocket, UserId>();
const userIdToSocket = new Map<UserId, WebSocket>();

class Room extends Syncable {
	roomName: RoomId;
	members: Array<{ id: UserId; mods: Array<string> }> = [];

	constructor(roomName: RoomId) {
		super(roomName);
		this.roomName = roomName;
	}

	addMember(member: { id: UserId; mods: Array<string> }) {
		this.members.push(member);
		userIdToRoom.set(member.id, this);
	}

	removeMember(id: UserId) {
		this.members = this.members.filter((m) => m.id === id);
		userIdToRoom.delete(id);
		if (this.members.length === 0) {
			rooms.delete(this.roomName);
		}
	}

	private sendMessageToUser(userId: UserId, message: DataEvent) {
		if (userId === message.from) return;

		const user = this.members.find((u) => u.id === userId);
		if (!user) return;

		if (!user.mods.includes(message.mod)) return;

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

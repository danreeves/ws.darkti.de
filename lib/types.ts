import {
	brand,
	array,
	literal,
	object,
	string,
	union,
	nullable,
	Output,
} from "https://deno.land/x/valibot@v0.24.1/mod.ts";

const RoomId = brand(string(), "RoomId");
export type RoomId = Output<typeof RoomId>;

const UserId = brand(string(), "UserId");
export type UserId = Output<typeof UserId>;

export const JoinEvent = object({
	type: literal("join"),
	id: UserId,
	room: RoomId,
	mods: nullable(array(string())),
});

const LeaveEvent = object({
	type: literal("leave"),
});

export const DataEvent = object({
	type: literal("data"),
	mod: string(),
	to: union([literal("all"), array(UserId)]),
	from: UserId,
	data: string(),
});

export type DataEvent = Output<typeof DataEvent>;

export type Peer = { id: UserId; mods: Array<string> | null };

export type JoinedEvent = {
	type: "joined";
	from: "server";
	peers: Array<Peer>;
};

export type LeftEvent = {
	type: "left";
	from: "server";
	id: UserId;
};

export const Event = union([JoinEvent, LeaveEvent, DataEvent]);

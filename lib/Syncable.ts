type MethodCall = {
	methodName: string;
	args: unknown[];
	source: string;
};

export class Syncable {
	private channel: BroadcastChannel;
	private source: string;

	constructor(channelName: string) {
		this.channel = new BroadcastChannel(channelName);
		this.source = Math.random().toString(36).substring(2);

		this.channel.onmessage = (event) => {
			const { methodName, args, source }: MethodCall = event.data;
			if (source !== this.source) {
				// @ts-expect-error: Can't index class with string
				if (typeof this[methodName] === "function") {
					// @ts-expect-error: Can't index class with string
					this[methodName](...args);
				}
			}
		};

		return new Proxy(this, {
			get: (target, prop, receiver) => {
				// @ts-expect-error: Can't index class with string
				const origMethod = target[prop];
				if (
					typeof origMethod === "function" &&
					typeof prop === "string" &&
					prop !== "constructor"
				) {
					return (...args: unknown[]) => {
						const result = origMethod.apply(target, args);
						const methodCall: MethodCall = {
							methodName: prop,
							args,
							source: this.source,
						};
						this.channel.postMessage(methodCall);
						return result;
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});
	}
}

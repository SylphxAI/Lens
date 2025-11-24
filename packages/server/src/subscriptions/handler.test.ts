/**
 * @lens/server - SubscriptionHandler Tests
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
	SubscriptionHandler,
	createSubscriptionHandler,
	type SubscriptionClient,
	type ServerUpdateMessage,
} from "./handler";

describe("SubscriptionHandler", () => {
	let handler: SubscriptionHandler;
	let mockClient: SubscriptionClient;
	let sentMessages: ServerUpdateMessage[];

	beforeEach(() => {
		handler = createSubscriptionHandler();
		sentMessages = [];
		mockClient = {
			id: "client-1",
			send: (msg) => sentMessages.push(msg),
			close: mock(() => {}),
		};
	});

	describe("addClient/removeClient", () => {
		it("adds client", () => {
			handler.addClient(mockClient);
			expect(handler.getStats().clients).toBe(1);
		});

		it("removes client and cleans up subscriptions", () => {
			handler.addClient(mockClient);

			// Subscribe to something
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			expect(handler.hasSubscribers("User", "123")).toBe(true);

			handler.removeClient("client-1");

			expect(handler.getStats().clients).toBe(0);
			expect(handler.hasSubscribers("User", "123")).toBe(false);
		});
	});

	describe("subscribe", () => {
		beforeEach(() => {
			handler.addClient(mockClient);
		});

		it("subscribes to specific fields", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "bio"],
			});

			const fields = handler.getSubscribedFields("User", "123");
			expect(fields).toContain("name");
			expect(fields).toContain("bio");
		});

		it("subscribes to all fields with wildcard", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			const fields = handler.getSubscribedFields("User", "123");
			expect(fields).toEqual(["*"]);
		});

		it("tracks multiple subscriptions from same client", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "Post",
				id: "456",
				fields: ["title"],
			});

			expect(handler.hasSubscribers("User", "123")).toBe(true);
			expect(handler.hasSubscribers("Post", "456")).toBe(true);
		});
	});

	describe("unsubscribe", () => {
		beforeEach(() => {
			handler.addClient(mockClient);
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "bio"],
			});
		});

		it("unsubscribes from specific fields", () => {
			handler.handleMessage("client-1", {
				type: "unsubscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			const fields = handler.getSubscribedFields("User", "123");
			expect(fields).not.toContain("name");
			expect(fields).toContain("bio");
		});

		it("unsubscribes from all fields with wildcard", () => {
			handler.handleMessage("client-1", {
				type: "unsubscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			expect(handler.hasSubscribers("User", "123")).toBe(false);
		});
	});

	describe("pushUpdate", () => {
		beforeEach(() => {
			handler.addClient(mockClient);
		});

		it("sends update to field subscribers", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "New Name",
			});

			expect(sentMessages.length).toBe(1);
			expect(sentMessages[0]).toEqual({
				type: "update",
				entity: "User",
				id: "123",
				field: "name",
				update: { strategy: "value", data: "New Name" },
			});
		});

		it("sends update to wildcard subscribers", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			handler.pushUpdate("User", "123", "anyField", {
				strategy: "value",
				data: "anything",
			});

			expect(sentMessages.length).toBe(1);
		});

		it("does not send to non-subscribers", () => {
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.pushUpdate("User", "123", "bio", {
				strategy: "value",
				data: "New Bio",
			});

			expect(sentMessages.length).toBe(0);
		});

		it("does not send for non-existent entity", () => {
			handler.pushUpdate("User", "999", "name", {
				strategy: "value",
				data: "New Name",
			});

			expect(sentMessages.length).toBe(0);
		});
	});

	describe("pushEntityUpdate", () => {
		it("pushes multiple field updates", () => {
			handler.addClient(mockClient);
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			handler.pushEntityUpdate("User", "123", {
				name: { strategy: "value", data: "New Name" },
				bio: { strategy: "value", data: "New Bio" },
			});

			expect(sentMessages.length).toBe(2);
		});
	});

	describe("pushFullUpdate", () => {
		it("pushes full entity as value updates", () => {
			handler.addClient(mockClient);
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			handler.pushFullUpdate("User", "123", {
				name: "John",
				bio: "Hello",
			});

			expect(sentMessages.length).toBe(2);
			expect(sentMessages[0].update).toEqual({ strategy: "value", data: "John" });
			expect(sentMessages[1].update).toEqual({ strategy: "value", data: "Hello" });
		});
	});

	describe("multiple clients", () => {
		it("sends updates to all subscribed clients", () => {
			const messages1: ServerUpdateMessage[] = [];
			const messages2: ServerUpdateMessage[] = [];

			handler.addClient({
				id: "client-1",
				send: (msg) => messages1.push(msg),
				close: () => {},
			});

			handler.addClient({
				id: "client-2",
				send: (msg) => messages2.push(msg),
				close: () => {},
			});

			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.handleMessage("client-2", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "New Name",
			});

			expect(messages1.length).toBe(1);
			expect(messages2.length).toBe(1);
		});

		it("sends to correct clients based on field subscription", () => {
			const messages1: ServerUpdateMessage[] = [];
			const messages2: ServerUpdateMessage[] = [];

			handler.addClient({
				id: "client-1",
				send: (msg) => messages1.push(msg),
				close: () => {},
			});

			handler.addClient({
				id: "client-2",
				send: (msg) => messages2.push(msg),
				close: () => {},
			});

			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.handleMessage("client-2", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["bio"],
			});

			handler.pushUpdate("User", "123", "name", {
				strategy: "value",
				data: "New Name",
			});

			expect(messages1.length).toBe(1);
			expect(messages2.length).toBe(0);
		});
	});

	describe("getSubscriberCount", () => {
		it("returns correct count", () => {
			handler.addClient({
				id: "client-1",
				send: () => {},
				close: () => {},
			});

			handler.addClient({
				id: "client-2",
				send: () => {},
				close: () => {},
			});

			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.handleMessage("client-2", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "bio"],
			});

			expect(handler.getSubscriberCount("User", "123")).toBe(2);
		});
	});

	describe("onSubscriptionChange callback", () => {
		it("calls callback when subscriptions change", () => {
			const changes: Array<{ entity: string; id: string; fields: string[] }> = [];

			const handlerWithCallback = createSubscriptionHandler({
				onSubscriptionChange: (entity, id, fields) => {
					changes.push({ entity, id, fields });
				},
			});

			handlerWithCallback.addClient(mockClient);

			handlerWithCallback.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			expect(changes.length).toBe(1);
			expect(changes[0]).toEqual({
				entity: "User",
				id: "123",
				fields: ["name"],
			});
		});
	});

	describe("getStats", () => {
		it("returns correct statistics", () => {
			handler.addClient(mockClient);
			handler.addClient({
				id: "client-2",
				send: () => {},
				close: () => {},
			});

			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name", "bio"],
			});

			handler.handleMessage("client-2", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: "*",
			});

			const stats = handler.getStats();
			expect(stats.clients).toBe(2);
			expect(stats.subscriptions).toBe(1); // One entity
			expect(stats.totalFieldSubscriptions).toBe(3); // 2 field + 1 wildcard
		});
	});

	describe("closeAll", () => {
		it("closes all clients and clears state", () => {
			handler.addClient(mockClient);
			handler.handleMessage("client-1", {
				type: "subscribe",
				entity: "User",
				id: "123",
				fields: ["name"],
			});

			handler.closeAll();

			expect(handler.getStats().clients).toBe(0);
			expect(handler.getStats().subscriptions).toBe(0);
		});
	});
});

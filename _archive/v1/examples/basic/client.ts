/**
 * Example Lens Client - Using InProcessTransport
 */

import { InProcessTransport } from "../../packages/lens-core/src/index.js";
import { api, type API } from "./api.js";

// Create transport
const transport = new InProcessTransport({ api });

// Demo: Query with field selection
async function demo() {
	console.log("=== Lens Example ===\n");

	// 1. Get user with all fields
	console.log("1. Get user (all fields):");
	const user = await transport.query({
		type: "query",
		path: ["user", "get"],
		input: { id: "1" },
	});
	console.log(user);
	console.log();

	// 2. Get user with field selection (array syntax)
	console.log("2. Get user (selected fields - array syntax):");
	const userBasic = await transport.query({
		type: "query",
		path: ["user", "get"],
		input: { id: "1" },
		select: ["id", "name", "email"],
	});
	console.log(userBasic);
	console.log();

	// 3. Get user with nested field selection (object syntax)
	console.log("3. Get user with posts (nested selection):");
	const userWithPosts = await transport.query({
		type: "query",
		path: ["user", "get"],
		input: { id: "1" },
		select: {
			id: true,
			name: true,
			posts: {
				id: true,
				title: true,
				published: true,
			},
		},
	});
	console.log(JSON.stringify(userWithPosts, null, 2));
	console.log();

	// 4. Create new user
	console.log("4. Create new user:");
	const newUser = await transport.query({
		type: "mutation",
		path: ["user", "create"],
		input: {
			name: "Charlie",
			email: "charlie@example.com",
			bio: "Designer crafting beautiful experiences",
		},
	});
	console.log(newUser);
	console.log();

	// 5. Update user
	console.log("5. Update user bio:");
	const updated = await transport.query({
		type: "mutation",
		path: ["user", "update"],
		input: {
			id: "1",
			data: {
				bio: "Full-stack engineer building with TypeScript & Lens",
			},
		},
	});
	console.log(updated);
	console.log();

	// 6. List users
	console.log("6. List all users:");
	const allUsers = await transport.query({
		type: "query",
		path: ["user", "list"],
		input: { limit: 10, offset: 0 },
	});
	console.log(allUsers);
	console.log();

	// 7. Create and publish post
	console.log("7. Create post:");
	const newPost = await transport.query({
		type: "mutation",
		path: ["post", "create"],
		input: {
			title: "Lens in Action",
			content: "This is a demo of Lens framework...",
			authorId: "1",
		},
	});
	console.log(newPost);
	console.log();

	console.log("8. Publish post:");
	const published = await transport.query({
		type: "mutation",
		path: ["post", "publish"],
		input: { id: newPost.id },
	});
	console.log(published);
	console.log();

	// 9. Test validation error
	console.log("9. Test validation (should fail):");
	try {
		await transport.query({
			type: "query",
			path: ["user", "get"],
			input: { id: 999 }, // Invalid: should be string
		});
	} catch (error: any) {
		console.log("❌ Error:", error.message);
	}
	console.log();

	// 10. Test not found error
	console.log("10. Test not found (should fail):");
	try {
		await transport.query({
			type: "query",
			path: ["user", "get"],
			input: { id: "999" },
		});
	} catch (error: any) {
		console.log("❌ Error:", error.message);
	}

	console.log("\n=== Demo Complete ===");
}

// Run demo
demo().catch(console.error);

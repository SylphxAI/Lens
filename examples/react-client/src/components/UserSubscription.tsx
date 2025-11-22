import { useSubscription } from "@sylphx/lens-react";

interface User {
	id: string;
	name: string;
	email: string;
	status: "online" | "offline" | "away";
	lastSeen: string;
}

export function UserSubscription({ userId }: { userId: string }) {
	const { data, isConnected, error } = useSubscription<User>(
		{
			type: "subscription",
			path: ["user", "get"],
			input: { id: userId },
			updateMode: "auto",
		},
		{
			onData: (data) => {
				console.log("Real-time update:", data);
			},
			onError: (error) => {
				console.error("Subscription error:", error);
			},
			onComplete: () => {
				console.log("Subscription completed");
			},
		},
	);

	return (
		<div
			style={{
				padding: "1rem",
				border: "1px solid #ccc",
				borderRadius: "4px",
			}}
		>
			<h3>Real-time User Updates</h3>
			<p>
				Connection: <strong>{isConnected ? "Connected" : "Disconnected"}</strong>
			</p>
			{error && <p style={{ color: "red" }}>Error: {error.message}</p>}
			{data && (
				<div style={{ marginTop: "1rem" }}>
					<p>{data.name}</p>
					<p>
						Status: <strong>{data.status}</strong>
					</p>
					<p>Last seen: {new Date(data.lastSeen).toLocaleString()}</p>
				</div>
			)}
		</div>
	);
}

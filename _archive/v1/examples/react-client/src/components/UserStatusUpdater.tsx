import { useMutation } from "@sylphx/lens-react";

interface User {
	id: string;
	name: string;
	email: string;
	status: "online" | "offline" | "away";
	lastSeen: string;
}

export function UserStatusUpdater({ userId }: { userId: string }) {
	const { mutate, isLoading, error, data } = useMutation<
		User,
		{
			type: "mutation";
			path: string[];
			input: { id: string; status: "online" | "offline" | "away" };
		}
	>({
		onSuccess: (data) => {
			console.log("Status updated:", data);
		},
		onError: (error) => {
			console.error("Update failed:", error);
		},
	});

	const updateStatus = (status: "online" | "offline" | "away") => {
		mutate({
			type: "mutation",
			path: ["user", "updateStatus"],
			input: { id: userId, status },
		});
	};

	return (
		<div
			style={{
				padding: "1rem",
				border: "1px solid #ccc",
				borderRadius: "4px",
			}}
		>
			<h3>Update User Status</h3>
			<div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
				<button onClick={() => updateStatus("online")} disabled={isLoading}>
					Set Online
				</button>
				<button onClick={() => updateStatus("away")} disabled={isLoading}>
					Set Away
				</button>
				<button onClick={() => updateStatus("offline")} disabled={isLoading}>
					Set Offline
				</button>
			</div>
			{isLoading && <p>Updating...</p>}
			{error && <p style={{ color: "red" }}>Error: {error.message}</p>}
			{data && (
				<div style={{ marginTop: "1rem", padding: "0.5rem", background: "#f0f0f0" }}>
					<p>
						Updated: {data.name} is now <strong>{data.status}</strong>
					</p>
				</div>
			)}
		</div>
	);
}

import { useQuery } from "@sylphx/lens-react";

interface User {
	id: string;
	name: string;
	email: string;
	status: "online" | "offline" | "away";
	lastSeen: string;
}

export function UserProfile({ userId }: { userId: string }) {
	const { data, isLoading, error, refetch } = useQuery<User>(
		{
			type: "query",
			path: ["user", "get"],
			input: { id: userId },
		},
		{
			onSuccess: (data) => {
				console.log("User loaded:", data);
			},
		},
	);

	if (isLoading) return <div>Loading user...</div>;
	if (error) return <div style={{ color: "red" }}>Error: {error.message}</div>;
	if (!data) return <div>No user found</div>;

	return (
		<div
			style={{
				padding: "1rem",
				border: "1px solid #ccc",
				borderRadius: "4px",
			}}
		>
			<h3>{data.name}</h3>
			<p>Email: {data.email}</p>
			<p>
				Status: <strong>{data.status}</strong>
			</p>
			<p>Last seen: {new Date(data.lastSeen).toLocaleString()}</p>
			<button onClick={() => refetch()}>Refresh</button>
		</div>
	);
}

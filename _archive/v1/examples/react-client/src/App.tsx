import { LensProvider } from "@sylphx/lens-react";
import { HTTPTransport } from "@sylphx/lens-transport-http";
import { UserProfile } from "./components/UserProfile";
import { UserStatusUpdater } from "./components/UserStatusUpdater";
import { UserSubscription } from "./components/UserSubscription";

const transport = new HTTPTransport({
	url: "http://localhost:3000/lens",
});

export function App() {
	return (
		<LensProvider transport={transport}>
			<div style={{ padding: "2rem", fontFamily: "system-ui" }}>
				<h1>Lens React Example</h1>

				<section style={{ marginTop: "2rem" }}>
					<h2>useQuery Example</h2>
					<UserProfile userId="1" />
				</section>

				<section style={{ marginTop: "2rem" }}>
					<h2>useMutation Example</h2>
					<UserStatusUpdater userId="1" />
				</section>

				<section style={{ marginTop: "2rem" }}>
					<h2>useSubscription Example</h2>
					<UserSubscription userId="1" />
				</section>
			</div>
		</LensProvider>
	);
}

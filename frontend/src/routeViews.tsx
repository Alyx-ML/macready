import { useParams } from "@tanstack/react-router";
import { GameDB } from "./components/GameDB";

export function HomeRouteView() {
  return <GameDB routeView="home" />;
}

export function CompatibilityRouteView() {
  return <GameDB routeView="compatibility" />;
}

export function AccountRouteView() {
  return <GameDB routeView="home" routeAccount />;
}

export function GameDetailRouteView() {
  const params = useParams({ strict: false }) as { gameId?: string };
  return <GameDB routeView="compatibility" routeDetailId={Number(params.gameId)} />;
}

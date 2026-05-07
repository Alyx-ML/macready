import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";

function basepath() {
  const base = import.meta.env.BASE_URL || "/";
  return base === "/" ? "/" : base.replace(/\/$/, "");
}

const rootRoute = createRootRoute();

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./routeViews"), "HomeRouteView"),
});

const compatibilityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compatibility",
  component: lazyRouteComponent(() => import("./routeViews"), "CompatibilityRouteView"),
});

const gameDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compatibility/$gameId",
  component: lazyRouteComponent(() => import("./routeViews"), "GameDetailRouteView"),
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: lazyRouteComponent(() => import("./routeViews"), "AccountRouteView"),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  compatibilityRoute,
  gameDetailRoute,
  accountRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: basepath(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

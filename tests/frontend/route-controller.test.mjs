import assert from "node:assert/strict";
import test from "node:test";

import { RouteController } from "../../drive_board/web/static/app/routing/RouteController.js";

function createController(overrides = {}) {
  const state = {
    activeView: "files",
    currentWorkspace: "huangshiyu",
    currentPath: "notes/demo.txt",
    fileQuery: "report",
    sortField: "name",
    sortDirection: "desc",
    page: 2,
    pageSize: 50,
    ...overrides.state,
  };
  const historyCalls = [];
  const controller = new RouteController({
    state,
    normalizePathInput: (value) => String(value ?? "").trim().replace(/^\/+|\/+$/g, ""),
    getCurrentUrl: overrides.getCurrentUrl || (() => "/app/files/huangshiyu/notes/demo.txt?q=report&sort=name&dir=desc&page=2&size=50"),
    getLocationHref: overrides.getLocationHref || (() => "http://localhost/app/files/huangshiyu/notes/demo.txt?q=report&sort=name&dir=desc&page=2&size=50"),
    updateHistory: overrides.updateHistory || ((payload) => historyCalls.push(payload)),
    getExtension: overrides.getExtension || (() => null),
  });
  return { controller, historyCalls };
}

test("buildUrl serializes file routes and trims default query params", () => {
  const { controller } = createController();
  assert.equal(
    controller.buildUrl(),
    "/app/files/huangshiyu/notes/demo.txt?q=report&sort=name&dir=desc&page=2&size=50",
  );

  const { controller: defaultController } = createController({
    state: {
      currentPath: "",
      fileQuery: "",
      sortField: "modified_at",
      sortDirection: "desc",
      page: 1,
      pageSize: 20,
    },
    getCurrentUrl: () => "/app/files/huangshiyu",
  });
  assert.equal(defaultController.buildUrl(), "/app/files/huangshiyu");
});

test("buildUrl delegates extension-owned views to extension routing", () => {
  const { controller } = createController({
    state: { activeView: "extension:admin" },
    getExtension: () => ({
      buildUrl(currentState) {
        return currentState.activeView === "extension:admin" ? "/app/admin/actors" : null;
      },
    }),
  });
  assert.equal(controller.buildUrl(), "/app/admin/actors");
});

test("sync only pushes history when the route actually changes", () => {
  const unchanged = createController();
  assert.equal(unchanged.controller.sync({ replace: false }), false);
  assert.deepEqual(unchanged.historyCalls, []);

  const changed = createController({
    getCurrentUrl: () => "/app/files/huangshiyu",
  });
  assert.equal(changed.controller.sync({ replace: true }), true);
  assert.deepEqual(changed.historyCalls, [
    {
      replace: true,
      url: "/app/files/huangshiyu/notes/demo.txt?q=report&sort=name&dir=desc&page=2&size=50",
    },
  ]);
});

test("parseRoute decodes file routes and normalizes invalid query params", () => {
  const { controller } = createController();
  assert.deepEqual(
    controller.parseRoute("http://localhost/app/files/agent%20team/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/%E7%BB%88%E7%A8%BF.txt?q=hello&sort=size&dir=asc&page=3&size=100"),
    {
      view: "files",
      workspace: "agent team",
      path: "中文 目录/终稿.txt",
      fileQuery: "hello",
      sortField: "size",
      sortDirection: "asc",
      page: 3,
      pageSize: 100,
    },
  );
  assert.deepEqual(
    controller.parseRoute("http://localhost/app/files/huangshiyu?q=x&sort=bad&dir=bad&page=0&size=999"),
    {
      view: "files",
      workspace: "huangshiyu",
      path: "",
      fileQuery: "x",
      sortField: "modified_at",
      sortDirection: "desc",
      page: 1,
      pageSize: 20,
    },
  );
});

test("parseRoute handles built-in manager routes and extension fallbacks", () => {
  const { controller } = createController({
    getExtension: () => ({
      parseRoute(url) {
        return url.pathname === "/extension/demo" ? { view: "extension:demo" } : null;
      },
    }),
  });
  assert.deepEqual(controller.parseRoute("http://localhost/app/shared?workspace=huangshiyu"), {
    view: "shared",
    workspace: "huangshiyu",
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.parseRoute("http://localhost/app/share-manager/demo-space"), {
    view: "share-manager",
    workspace: "demo-space",
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.parseRoute("http://localhost/app/workspace-members/demo-space"), {
    view: "workspace-members",
    workspace: "demo-space",
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.parseRoute("http://localhost/app/profile?workspace=demo-space"), {
    view: "profile",
    workspace: "demo-space",
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.parseRoute("http://localhost/app/admin/actors?workspace=demo-space"), {
    view: "actor-admin",
    workspace: "demo-space",
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.parseRoute("http://localhost/extension/demo"), { view: "extension:demo" });
});

test("fileRoutePreferences fills in defaults for missing file state", () => {
  const { controller } = createController();
  assert.deepEqual(controller.fileRoutePreferences(), {
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(controller.fileRoutePreferences({ sortField: "name", pageSize: 100, page: 4, fileQuery: "abc" }), {
    fileQuery: "abc",
    sortField: "name",
    sortDirection: "asc",
    page: 4,
    pageSize: 100,
  });
});
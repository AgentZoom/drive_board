import { ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE, ROUTE_PREFIX } from "../constants.js";
import { decodeRoutePart } from "../utils/url.js";

const DEFAULT_BASE_URL = "http://localhost";

export class RouteController {
  constructor({
    state,
    getExtension = () => null,
    normalizePathInput = (value) => String(value ?? "").trim(),
    routePrefix = ROUTE_PREFIX,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    allowedPageSizes = ALLOWED_PAGE_SIZES,
    decodeRouteSegment = decodeRoutePart,
    getLocationHref = () => window.location.href,
    getCurrentUrl = () => `${window.location.pathname}${window.location.search}`,
    updateHistory = ({ replace, url }) => {
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
    },
  }) {
    this.state = state;
    this.getExtension = getExtension;
    this.normalizePathInput = normalizePathInput;
    this.routePrefix = routePrefix;
    this.defaultPageSize = defaultPageSize;
    this.allowedPageSizes = allowedPageSizes;
    this.decodeRouteSegment = decodeRouteSegment;
    this.getLocationHref = getLocationHref;
    this.getCurrentUrl = getCurrentUrl;
    this.updateHistory = updateHistory;
  }

  normalizePageSize(value) {
    const size = Number(value) || this.defaultPageSize;
    return this.allowedPageSizes.has(size) ? size : this.defaultPageSize;
  }

  defaultSortDirection(field) {
    return field === "modified_at" ? "desc" : "asc";
  }

  fileRoutePreferences(route = null) {
    const sortField = route?.sortField || "modified_at";
    return {
      fileQuery: route?.fileQuery || "",
      sortField,
      sortDirection: route?.sortDirection || this.defaultSortDirection(sortField),
      page: route?.page || 1,
      pageSize: this.normalizePageSize(route?.pageSize),
    };
  }

  buildUrl() {
    const extensionUrl = this.getExtension()?.buildUrl?.(this.state);
    if (extensionUrl) {
      return extensionUrl;
    }

    const segments = [this.routePrefix];
    const params = new URLSearchParams();

    switch (this.state.activeView) {
      case "shared":
        segments.push("shared");
        if (this.state.currentWorkspace) {
          params.set("workspace", this.state.currentWorkspace);
        }
        break;
      case "share-manager":
        segments.push("share-manager");
        if (this.state.currentWorkspace) {
          segments.push(encodeURIComponent(this.state.currentWorkspace));
        }
        break;
      case "workspace-members":
        segments.push("workspace-members");
        if (this.state.currentWorkspace) {
          segments.push(encodeURIComponent(this.state.currentWorkspace));
        }
        break;
      case "actor-admin":
        segments.push("admin", "actors");
        if (this.state.currentWorkspace) {
          params.set("workspace", this.state.currentWorkspace);
        }
        break;
      case "profile":
        segments.push("profile");
        if (this.state.currentWorkspace) {
          params.set("workspace", this.state.currentWorkspace);
        }
        break;
      case "files":
      default: {
        segments.push("files");
        if (this.state.currentWorkspace) {
          segments.push(encodeURIComponent(this.state.currentWorkspace));
          const normalizedPath = this.normalizePathInput(this.state.currentPath);
          if (normalizedPath) {
            segments.push(...normalizedPath.split("/").map(encodeURIComponent));
          }
        }
        if (this.state.fileQuery) {
          params.set("q", this.state.fileQuery);
        }
        if (this.state.sortField !== "modified_at") {
          params.set("sort", this.state.sortField);
        }
        if (this.state.sortDirection !== this.defaultSortDirection(this.state.sortField)) {
          params.set("dir", this.state.sortDirection);
        }
        if (this.state.page !== 1) {
          params.set("page", String(this.state.page));
        }
        if (this.state.pageSize !== this.defaultPageSize) {
          params.set("size", String(this.state.pageSize));
        }
        break;
      }
    }

    const query = params.toString();
    return `${segments.join("/")}${query ? `?${query}` : ""}`;
  }

  sync({ replace = false } = {}) {
    const nextUrl = this.buildUrl();
    const currentUrl = this.getCurrentUrl();
    if (nextUrl === currentUrl) {
      return false;
    }
    this.updateHistory({ replace, url: nextUrl });
    return true;
  }

  parseRoute(input = this.getLocationHref()) {
    const url = input instanceof URL ? input : new URL(input, DEFAULT_BASE_URL);
    const segments = url.pathname.split("/").filter(Boolean).map(this.decodeRouteSegment);
    if (segments[0] !== this.routePrefix.slice(1)) {
      return this.getExtension()?.parseRoute?.(url) || null;
    }

    const params = url.searchParams;
    const route = {
      view: "files",
      workspace: null,
      path: "",
      fileQuery: "",
      sortField: "modified_at",
      sortDirection: "desc",
      page: 1,
      pageSize: this.defaultPageSize,
    };

    if (segments[1] === "shared") {
      route.view = "shared";
      route.workspace = params.get("workspace") || null;
      return route;
    }
    if (segments[1] === "share-manager") {
      route.view = "share-manager";
      route.workspace = segments[2] || params.get("workspace") || null;
      return route;
    }
    if (segments[1] === "workspace-members") {
      route.view = "workspace-members";
      route.workspace = segments[2] || params.get("workspace") || null;
      return route;
    }
    if (segments[1] === "admin" && segments[2] === "actors") {
      route.view = "actor-admin";
      route.workspace = params.get("workspace") || null;
      return route;
    }
    if (segments[1] === "profile") {
      route.view = "profile";
      route.workspace = params.get("workspace") || null;
      return route;
    }

    const fileSegments = segments[1] === "files" ? segments.slice(2) : [];
    route.workspace = fileSegments[0] || params.get("workspace") || null;
    route.path = fileSegments.length > 1 ? fileSegments.slice(1).join("/") : "";
    route.fileQuery = params.get("q") || "";

    const sortField = params.get("sort");
    if (["name", "size", "modified_at"].includes(sortField)) {
      route.sortField = sortField;
    }
    const sortDirection = params.get("dir");
    route.sortDirection = sortDirection === "asc" || sortDirection === "desc"
      ? sortDirection
      : this.defaultSortDirection(route.sortField);

    const page = Number.parseInt(params.get("page") || "1", 10);
    route.page = Number.isInteger(page) && page > 0 ? page : 1;
    route.pageSize = this.normalizePageSize(params.get("size"));
    return route;
  }
}
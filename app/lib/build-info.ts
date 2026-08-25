declare const __COMMIT_HASH__: string | undefined;

export const BUILD_INFO = {
  version: "0.1.0",
  commit: typeof __COMMIT_HASH__ !== "undefined" && __COMMIT_HASH__ ? __COMMIT_HASH__ : "unknown",
  get display() {
    return `Build ${this.commit}`;
  },
} as const;

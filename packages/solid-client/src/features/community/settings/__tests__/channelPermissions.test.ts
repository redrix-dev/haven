import { describe, expect, it } from "vitest";
import {
  channelPermissionLabel,
  nextChannelPermission,
} from "../channelPermissionControls";

describe("channel permission controls", () => {
  it("cycles default to allow to deny and back to default", () => {
    expect(nextChannelPermission(null)).toBe(true);
    expect(nextChannelPermission(true)).toBe(false);
    expect(nextChannelPermission(false)).toBe(null);
  });

  it("labels each permission state plainly", () => {
    expect(channelPermissionLabel(null)).toBe("Default");
    expect(channelPermissionLabel(true)).toBe("Allow");
    expect(channelPermissionLabel(false)).toBe("Deny");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { MyAccount, SettingsChanges } from "@shared/lib/backend/people";
import { Account, accountCopy, createAccountState } from "../account/account";
import {
  accountLoaded,
  activeFlair,
  isFlagOn,
  nextOnboarding,
  termsToAccept,
  usableFlairs,
} from "../account/selectors";
import { createPlainStatePort } from "../kit/statePort";
import { campaign, deferred, heldFlair, myAccount, profile } from "./fixtures";

const web = { platform: "web", app_version: "1.4.0" };

/** Each load answers with the next account given, then the last one again. */
function setup(...answers: MyAccount[]) {
  const port = createPlainStatePort(createAccountState());
  const next = () => (answers.length > 1 ? answers.shift()! : answers[0]);
  const calls = {
    loadMyAccount: vi.fn(async () => next()),
    updateMySettings: vi.fn(async (changes: SettingsChanges) => ({
      ...myAccount().settings!,
      ...changes,
      updated_at: "2026-11-14T13:00:00Z",
    })),
    updateMyProfile: vi.fn(async () => profile("me", { username: "renamed" })),
    acceptTerms: vi.fn(async () => {}),
    setActiveFlair: vi.fn(async () => {}),
    answerOnboarding: vi.fn(async () => {}),
    deleteMyAccount: vi.fn(async () => {}),
  };
  return { port, calls, account: new Account(port, calls, web) };
}

const newTerms = (accepted: boolean) =>
  myAccount({
    terms_versions: [
      { version: "2026-12-01", published_at: "2026-12-01T00:00:00Z" },
      { version: "2026-03-24", published_at: "2026-03-24T00:00:00Z" },
    ],
    terms_accepted: [
      {
        user_id: "me",
        version: "2026-03-24",
        accepted_at: "2026-11-01T00:00:00Z",
      },
      ...(accepted
        ? [
            {
              user_id: "me",
              version: "2026-12-01",
              accepted_at: "2026-12-02T00:00:00Z",
            },
          ]
        : []),
    ],
  });

describe("loading the account", () => {
  it("holds every part as the database sent it", async () => {
    const mine = myAccount({ onboarding: [campaign("welcome")] });
    const { port, calls, account } = setup(mine);
    await account.load();
    expect(calls.loadMyAccount).toHaveBeenCalledWith(web);
    const { requests: _requests, ...held } = port.get();
    expect(held).toEqual(mine);
    expect(accountLoaded(port.get())).toBe(true);
  });

  it("keeps the newest answer, not one from a load that started before a change", async () => {
    const { port, calls, account } = setup();
    const before = deferred<MyAccount>();
    calls.loadMyAccount
      .mockReturnValueOnce(before.promise)
      .mockResolvedValueOnce(
        myAccount({ feature_flags: [{ key: "x", enabled: true }] }),
      );
    const first = account.load();
    // account.changed arrives while the first load is out.
    await account.load();
    before.resolve(myAccount());
    await first;
    expect(isFlagOn(port.get(), "x")).toBe(true);
  });

  it("is not loaded when it only came back from the device, or the load failed", async () => {
    const { port, calls, account } = setup(myAccount());
    port.set(accountCopy.restore({ settings: myAccount().settings }));
    expect(accountLoaded(port.get())).toBe(false);
    calls.loadMyAccount.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await account.load();
    vi.restoreAllMocks();
    expect(accountLoaded(port.get())).toBe(false);
    expect(port.get().settings?.theme).toBe("default");
  });
});

describe("terms", () => {
  it("asks for the newest terms until they are accepted", async () => {
    const { port, calls, account } = setup(newTerms(false), newTerms(true));
    await account.load();
    expect(termsToAccept(port.get())).toBe("2026-12-01");
    await account.acceptTerms("2026-12-01");
    expect(calls.acceptTerms).toHaveBeenCalledWith("2026-12-01");
    expect(termsToAccept(port.get())).toBeNull();
  });

  it("asks for nothing when the newest is accepted, or before anything loaded", async () => {
    const { port, account } = setup(myAccount());
    expect(termsToAccept(port.get())).toBeNull();
    await account.load();
    expect(termsToAccept(port.get())).toBeNull();
  });
});

describe("commands", () => {
  it("shows new settings from the database's answer", async () => {
    const { port, calls, account } = setup(myAccount());
    await account.updateSettings({ theme: "midnight" });
    expect(calls.updateMySettings).toHaveBeenCalledWith({ theme: "midnight" });
    expect(port.get().settings?.theme).toBe("midnight");
    // The privacy rules are settings like any other.
    await account.updateSettings({ dms_from: "community" });
    expect(port.get().settings?.dms_from).toBe("community");
  });

  it("hands back everyone's view of a profile change, and loads what only the person sees", async () => {
    const changed = myAccount({
      profile: { bio: "hi", active_flair_id: null },
    });
    const { port, account } = setup(myAccount(), changed);
    await account.load();
    const record = await account.updateProfile({ bio: "hi" });
    expect(record.username).toBe("renamed");
    expect(port.get().profile?.bio).toBe("hi");
  });

  it("shows the flair chosen once the database has it", async () => {
    const flairs = [heldFlair("early")];
    const { port, calls, account } = setup(
      myAccount({ flairs }),
      myAccount({
        flairs,
        profile: { bio: null, active_flair_id: "early" },
      }),
    );
    await account.load();
    expect(activeFlair(port.get())).toBeNull();
    await account.setActiveFlair("early");
    expect(calls.setActiveFlair).toHaveBeenCalledWith("early");
    expect(activeFlair(port.get())?.flair.key).toBe("early");
  });

  it("answers an introduction from this build, and drops it once answered", async () => {
    const joins = campaign("join", { community_id: "hearth" });
    const { port, calls, account } = setup(
      myAccount({ onboarding: [campaign("rules"), joins] }),
      myAccount({ onboarding: [campaign("rules")] }),
    );
    await account.load();
    expect(nextOnboarding(port.get())?.key).toBe("rules");
    // Not the next one: what comes back is the one answered.
    const answered = await account.answerOnboarding("join", "completed");
    expect(calls.answerOnboarding).toHaveBeenCalledWith(
      "join",
      "completed",
      web,
    );
    expect(answered?.community_id).toBe("hearth");
    expect(port.get().onboarding.map((c) => c.key)).toEqual(["rules"]);
  });

  it("does not load again when the database refuses", async () => {
    const { calls, account } = setup(myAccount());
    calls.acceptTerms.mockRejectedValueOnce(new Error("unknown_terms_version"));
    await expect(account.acceptTerms("nope")).rejects.toThrow();
    expect(calls.loadMyAccount).not.toHaveBeenCalled();
  });
});

describe("views", () => {
  it("treats a flag the database does not know as off", async () => {
    const { port, account } = setup(
      myAccount({
        feature_flags: [
          { key: "on", enabled: true },
          { key: "off", enabled: false },
        ],
      }),
    );
    await account.load();
    expect(isFlagOn(port.get(), "on")).toBe(true);
    expect(isFlagOn(port.get(), "off")).toBe(false);
    expect(isFlagOn(port.get(), "unknown")).toBe(false);
  });

  it("offers only flairs that can still be shown, by label", async () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    const { port, account } = setup(
      myAccount({
        flairs: [
          heldFlair("zebra"),
          heldFlair("expired", { expires_at: "2026-11-13T00:00:00Z" }),
          heldFlair("retired", { retired_at: "2026-11-01T00:00:00Z" }),
          heldFlair("later", { expires_at: "2026-11-15T00:00:00Z" }),
          heldFlair("Apple"),
        ],
        profile: { bio: null, active_flair_id: "retired" },
      }),
    );
    await account.load();
    expect(usableFlairs(port.get(), now).map((h) => h.flair.key)).toEqual([
      "Apple",
      "later",
      "zebra",
    ]);
    // Chosen while it could be shown; retired since.
    expect(activeFlair(port.get(), now)).toBeNull();
  });
});

describe("the device copy", () => {
  it("keeps settings, and nothing else", () => {
    const state = { ...createAccountState(), ...newTerms(false) };
    const saved = JSON.parse(JSON.stringify(accountCopy.pick(state)));
    expect(saved).toEqual({ settings: myAccount().settings });
    expect(accountCopy.restore(saved)).toEqual({
      settings: myAccount().settings,
    });
  });

  it("is empty after sign-out", async () => {
    const { port, account } = setup(myAccount());
    await account.load();
    account.clear();
    expect(port.get()).toEqual(createAccountState());
  });
});

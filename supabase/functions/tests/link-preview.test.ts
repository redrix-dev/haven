// The link preview worker. The address rules run exactly as deployed; only
// the network underneath them is replaced, so that "site.test" can be a page
// served from this machine while still counting as a public address.

import { jobWorker } from "../_shared/jobs.ts";
import { isPublicAddress } from "../link-preview-worker/address.ts";
import { linkPreviewJob } from "../link-preview-worker/handler.ts";
import {
  assertPublicUrl,
  type Network,
  PreviewRefused,
  resolvePreview,
} from "../link-preview-worker/preview.ts";
import {
  actor,
  assert,
  assertEquals,
  channelId,
  type Fake,
  fakeService,
  jobFor,
  quietQueue,
  random,
  rpc,
  service,
  sql,
  test,
  wake,
} from "./_support.ts";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const ARTICLE = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="Bread &amp; butter &#8211; a guide">
  <meta property="og:description" content="  How to
     make both.  ">
  <meta property="og:site_name" content="The Pantry">
  <meta property="og:image" content="/pic.png">
</head><body>hello</body></html>`;

function site(): Fake {
  return fakeService((request) => {
    const path = request.path.split("?")[0];
    if (path.startsWith("/article")) {
      return new Response(ARTICLE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (path === "/pic.png") {
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    }
    if (path === "/vector") {
      return new Response(
        `<html><head><title>Vector</title><meta property="og:image" content="/pic.svg"></head></html>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    if (path === "/pic.svg") {
      return new Response("<svg/>", {
        headers: { "content-type": "image/svg+xml" },
      });
    }
    if (path === "/plain") {
      return new Response("just text", {
        headers: { "content-type": "text/plain" },
      });
    }
    if (path === "/to-metadata") {
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      });
    }
    if (path === "/to-inward-name") {
      return new Response(null, {
        status: 301,
        headers: { location: "https://inward.test/admin" },
      });
    }
    if (path === "/hop") {
      return new Response(null, {
        status: 302,
        headers: { location: "/article" },
      });
    }
    if (path === "/loop") {
      return new Response(null, {
        status: 302,
        headers: { location: "/loop" },
      });
    }
    if (path.startsWith("/down")) return new Response("no", { status: 503 });
    return new Response("not found", { status: 404 });
  });
}

/** A network where site.test is the local page and nothing else is reachable. */
function network(fake: Fake): Network & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    fetch: (url, init) => {
      fetched.push(url);
      const target = new URL(url);
      if (target.hostname !== "site.test") {
        throw new Error(`the worker tried to reach ${target.hostname}`);
      }
      return fetch(`${fake.url}${target.pathname}${target.search}`, init);
    },
    resolve: (hostname) =>
      Promise.resolve(
        {
          "site.test": ["93.184.216.34"],
          "inward.test": ["10.0.0.5"],
          "mixed.test": ["93.184.216.34", "192.168.1.10"],
          "six.test": ["fd00::1"],
        }[hostname] ?? [],
      ),
  };
}

async function refused(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof PreviewRefused) return error.message;
    throw error;
  }
}

test("only addresses on the public internet count as public", () => {
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
    assert(isPublicAddress(address), `${address} is public`);
  }
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "not an address",
    "",
  ]) {
    assert(!isPublicAddress(address), `"${address}" is not public`);
  }
  return Promise.resolve();
});

test("an address the worker must not fetch is refused before any request", async () => {
  const fake = site();
  const net = network(fake);
  try {
    for (const url of [
      "http://localhost/",
      "http://kong/",
      "http://db.internal/",
      "http://127.0.0.1/",
      "http://2130706433/", // 127.0.0.1 written as one number
      "http://0x7f.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://169.254.169.254/latest/meta-data/",
      "https://site.test:8443/",
      "https://someone:secret@site.test/",
      "ftp://site.test/file",
      "https://inward.test/", // a public-looking name that points inward
      "https://mixed.test/", // one public address, one private
      "https://six.test/",
    ]) {
      assert(
        (await refused(() => assertPublicUrl(net, url))) !== null,
        `${url} is refused`,
      );
    }
    assertEquals(net.fetched, [], "and nothing was fetched to find that out");
    assertEquals(
      (await assertPublicUrl(net, "https://site.test/article")).hostname,
      "site.test",
      "a public address passes",
    );
  } finally {
    await fake.close();
  }
});

test("a public page cannot redirect the worker to a private address", async () => {
  const fake = site();
  const net = network(fake);
  try {
    assertEquals(
      await refused(() => resolvePreview(net, "https://site.test/to-metadata")),
      "private address",
      "a redirect to the cloud metadata address is refused",
    );
    assertEquals(
      await refused(() =>
        resolvePreview(net, "https://site.test/to-inward-name"),
      ),
      "private address",
      "and so is one to a name that points inward",
    );
    assertEquals(
      net.fetched,
      ["https://site.test/to-metadata", "https://site.test/to-inward-name"],
      "the private address was never contacted",
    );
    assertEquals(
      await refused(() => resolvePreview(net, "https://site.test/loop")),
      "too many redirects",
      "a redirect loop ends",
    );
    assertEquals(
      net.fetched.filter((url) => url.endsWith("/loop")).length,
      4,
      "after the first request and three redirects",
    );
    assertEquals(
      (await resolvePreview(net, "https://site.test/hop")).title,
      "Bread & butter – a guide",
      "an ordinary redirect is followed",
    );
  } finally {
    await fake.close();
  }
});

test("a page's title, description and picture are read from its tags", async () => {
  const fake = site();
  try {
    const net = network(fake);
    assertEquals(
      await resolvePreview(net, "https://site.test/article"),
      {
        status: "ready",
        title: "Bread & butter – a guide",
        description: "How to make both.",
        siteName: "The Pantry",
        imageUrl: "https://site.test/pic.png",
        embedProvider: null,
        embedId: null,
      },
      "the preview is the page's own words, tidied",
    );
    assertEquals(
      (await resolvePreview(net, "https://site.test/plain")).status,
      "unsupported",
      "something that is not a web page has no preview",
    );
  } finally {
    await fake.close();
  }
});

/** Sends a message with a link and returns the message and its preview row. */
async function sendLink(url: string) {
  const memberA = await actor("member_a");
  const message = await rpc<{ id: string }>(memberA, "send_message", {
    p_channel_id: await channelId("general"),
    p_body: `have a look ${url}`,
  });
  const [preview] = await sql`
    select lp.id from public.link_previews lp
    join public.messages m on m.link_preview_id = lp.id where m.id = ${message.id}`;
  assert(preview, "sending a link makes a preview row");
  return { memberA, messageId: message.id, previewId: preview.id as string };
}

const previewRow = async (id: string) =>
  (
    await sql`select status, title, image_path, error from public.link_previews where id = ${id}`
  )[0];

test("a sent link gets its preview, its picture is cached, and viewers are told", async () => {
  await quietQueue();
  const fake = site();
  const run = jobWorker(
    { link_preview: linkPreviewJob(network(fake)) },
    { lingerMs: 0 },
  );
  try {
    const { memberA, messageId, previewId } = await sendLink(
      `https://site.test/article-${random()}`,
    );
    assertEquals(
      (await previewRow(previewId)).status,
      "pending",
      "it starts empty",
    );

    assertEquals((await run(wake())).status, 200, "the worker runs");
    const row = await previewRow(previewId);
    assertEquals(row.status, "ready", "the preview is ready");
    assertEquals(
      row.title,
      "Bread & butter – a guide",
      "with the page's title",
    );
    assert(/^[0-9a-f]{64}\.png$/.test(row.image_path), "and a cached picture");
    const { data: cached } = await service.storage
      .from("previews")
      .exists(row.image_path);
    assert(cached, "the picture is in the previews bucket");

    const [message] = await rpc<{ link_preview: { title: string } | null }[]>(
      memberA,
      "get_messages",
      { p_message_ids: [messageId] },
    );
    assertEquals(
      message.link_preview?.title,
      "Bread & butter – a guide",
      "the message now carries the preview",
    );
    const told = await sql`
      select 1 from realtime.messages
      where topic = ${"user:" + memberA.id} and event = 'message.updated'
        and payload ->> 'id' = ${messageId}`;
    assertEquals(
      told.length,
      1,
      "and people looking at it are told it changed",
    );
    assertEquals(
      (await jobFor("link_preview", "preview_id", previewId))?.status,
      "done",
      "the job is finished",
    );
  } finally {
    await fake.close();
  }
});

test("a picture of a kind Haven does not show is left out, not the preview", async () => {
  await quietQueue();
  const fake = site();
  const run = jobWorker(
    { link_preview: linkPreviewJob(network(fake)) },
    { lingerMs: 0 },
  );
  try {
    const { previewId } = await sendLink(
      `https://site.test/vector?${random()}`,
    );
    await run(wake());
    const row = await previewRow(previewId);
    assertEquals(
      [row.status, row.title, row.image_path],
      ["ready", "Vector", null],
      "the preview is kept without the SVG",
    );
  } finally {
    await fake.close();
  }
});

test("a link to a private address is marked failed and never fetched", async () => {
  await quietQueue();
  const fake = site();
  const net = network(fake);
  const run = jobWorker({ link_preview: linkPreviewJob(net) }, { lingerMs: 0 });
  try {
    const { previewId } = await sendLink(
      `http://169.254.169.254/latest/${random()}`,
    );
    await run(wake());
    const row = await previewRow(previewId);
    assertEquals(
      [row.status, row.error],
      ["failed", "private address"],
      "the preview says why",
    );
    assertEquals(net.fetched, [], "nothing was fetched");
    assertEquals(
      (await jobFor("link_preview", "preview_id", previewId))?.status,
      "done",
      "it is not retried",
    );
  } finally {
    await fake.close();
  }
});

test("a site that is down is tried three times, then the preview is marked failed", async () => {
  await quietQueue();
  const fake = site();
  const run = jobWorker(
    { link_preview: linkPreviewJob(network(fake)) },
    { lingerMs: 0 },
  );
  try {
    const { previewId } = await sendLink(`https://site.test/down-${random()}`);
    await run(wake());
    let job = await jobFor("link_preview", "preview_id", previewId);
    assertEquals(
      [job?.status, job?.attempts, (await previewRow(previewId)).status],
      ["pending", 1, "pending"],
      "after one failure it waits to be tried again",
    );

    // Bring the third attempt forward instead of waiting for it.
    await sql`update private.jobs set attempts = 2, run_at = now() where id = ${job!.id}`;
    await run(wake());
    job = await jobFor("link_preview", "preview_id", previewId);
    const row = await previewRow(previewId);
    assertEquals(
      [job?.status, job?.attempts, row.status],
      ["done", 3, "failed"],
      "after the third it gives up and says so",
    );
    assert(row.error.includes("503"), "with the site's answer as the reason");
  } finally {
    await fake.close();
  }
});

// Which network addresses the preview worker may talk to.
//
// The worker fetches addresses that people type into messages. Without this
// check a message could make Haven's own server fetch something only it can
// reach: another container, a cloud metadata service, a home router
// (server-side request forgery). Only addresses on the public internet pass.

function parseIpv4(text: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPublicIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this host, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier NAT, Tailscale
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // reserved, documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** An IPv6 address as its eight 16-bit groups, or null if it is not one. */
function parseIpv6(text: string): number[] | null {
  let source = text;

  // A dotted IPv4 tail ("::ffff:10.0.0.1") stands for the last two groups.
  const lastColon = source.lastIndexOf(":");
  if (lastColon === -1) return null;
  const tail = source.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    source = `${source.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  // "::" stands for as many zero groups as it takes to make eight.
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const head = parseGroups(halves[0]);
  const rest = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!head || !rest) return null;
  const known = head.length + rest.length;
  if (halves.length === 1) return known === 8 ? head : null;
  if (known > 7) return null;
  return [...head, ...new Array<number>(8 - known).fill(0), ...rest];
}

function embeddedIpv4(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isPublicIpv6(groups: number[]): boolean {
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return false; // private (fc00::/7)
  if ((first & 0xffc0) === 0xfe80) return false; // link-local (fe80::/10)
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // documentation

  // Forms that carry an IPv4 address inside them are judged by that address,
  // or "::ffff:127.0.0.1" would walk straight past the IPv4 rules.
  const leadingZeros = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeros && (groups[5] === 0xffff || groups[5] === 0)) {
    // IPv4-mapped, and the old IPv4-compatible form (which includes :: and ::1).
    return isPublicIpv4(embeddedIpv4(groups[6], groups[7]));
  }
  if (first === 0x0064 && groups[1] === 0xff9b) {
    return isPublicIpv4(embeddedIpv4(groups[6], groups[7])); // NAT64
  }
  if (first === 0x2002) {
    return isPublicIpv4(embeddedIpv4(groups[1], groups[2])); // 6to4
  }
  return true;
}

/** True only for an address on the public internet. Unknown text is not public. */
export function isPublicAddress(address: string): boolean {
  const text = address
    .trim()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  const v4 = parseIpv4(text);
  if (v4) return isPublicIpv4(v4);
  const v6 = parseIpv6(text);
  if (v6) return isPublicIpv6(v6);
  return false;
}

/** True when the text is an IP address rather than a name. */
export function isIpLiteral(hostname: string): boolean {
  const text = hostname.replace(/^\[|\]$/g, "");
  return parseIpv4(text) !== null || parseIpv6(text) !== null;
}

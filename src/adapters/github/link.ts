/** The pagination relations GitHub sends in the `link` header (SPEC §5.1, §5.6). */
export interface LinkRels {
  next?: string
  last?: string
  prev?: string
  first?: string
}

const KNOWN_RELS = new Set<keyof LinkRels>(['next', 'last', 'prev', 'first'])
const ENTRY = /^\s*<([^<>]+)>\s*;(.*)$/
const REL = /\brel\s*=\s*"([^"]*)"/

/**
 * Parses an RFC 8288 `link` header into the relations issue-criticity uses.
 * Pure and total: a missing header or malformed entries yield no relation, never an error.
 */
export function parseLinkHeader(header: string | null | undefined): LinkRels {
  const rels: LinkRels = {}
  if (!header) return rels
  for (const entry of header.split(',')) {
    const match = ENTRY.exec(entry)
    if (!match) continue
    const rel = REL.exec(match[2])
    if (!rel) continue
    for (const name of rel[1].trim().split(/\s+/)) {
      if (KNOWN_RELS.has(name as keyof LinkRels)) rels[name as keyof LinkRels] = match[1]
    }
  }
  return rels
}

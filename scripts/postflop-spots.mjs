/**
 * Heads-up postflop spots to solve, derived from the Cash 100bb PTO preflop charts:
 * every opener/caller pair with a calling range gives a single-raised pot.
 * Pot and stack follow the cash sizing profile (2.5bb open, SB opens 3bb).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** Postflop acting order: blinds first, button last. Later = in position. */
const POSTFLOP_ORDER = ['SB', 'BB', 'LJ', 'HJ', 'CO', 'BTN']

/** Bet-size tree in percent of pot. Kept small so a flop solves in a minute or two. */
export const TREE = {
  flop: { bet: [33], raise: [50] },
  turn: { bet: [50], raise: [50] },
  river: { bet: [50], raise: [50] },
  allinThreshold: 0.67,
}

function compactRange(text) {
  return text.replace(/\s+/g, '')
}

function openSize(position) {
  return position === 'SB' ? 3 : 2.5
}

export function buildSpots() {
  const entries = JSON.parse(readFileSync(path.join(root, 'public', 'ranges', 'Cash_100_PTO.json'), 'utf8'))
  const spots = []
  for (const entry of entries) {
    if (entry.scenario !== 'vs-raise' || !entry.range.call) continue
    const caller = entry.hero[0]
    for (const opener of entry.villain) {
      const open = entries.find((e) => e.scenario === 'open' && e.hero.includes(opener) && (!e.players || e.players.includes(6)))
      if (!open) continue
      const openerIp = POSTFLOP_ORDER.indexOf(opener) > POSTFLOP_ORDER.indexOf(caller)
      const bet = openSize(opener)
      const involved = [opener, caller]
      const deadBlinds = (involved.includes('SB') ? 0 : 0.5) + (involved.includes('BB') ? 0 : 1)
      const pot = Math.round((bet * 2 + deadBlinds) * 10) / 10
      spots.push({
        id: `srp-${opener}-${caller}`,
        kind: 'srp',
        opener,
        caller,
        ip: openerIp ? opener : caller,
        oop: openerIp ? caller : opener,
        ipRange: compactRange(openerIp ? open.range.raise : entry.range.call),
        oopRange: compactRange(openerIp ? entry.range.call : open.range.raise),
        pot,
        stack: 100 - bet,
      })
    }
  }
  return spots
}

export const POSTFLOP_SPOTS = buildSpots()

if (process.argv[1] && process.argv[1].endsWith('postflop-spots.mjs')) {
  for (const s of POSTFLOP_SPOTS) console.log(s.id, `ip=${s.ip} oop=${s.oop} pot=${s.pot} stack=${s.stack}`)
  console.log(POSTFLOP_SPOTS.length, 'spots')
}

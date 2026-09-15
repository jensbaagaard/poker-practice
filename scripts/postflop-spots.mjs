/**
 * Heads-up postflop spots to solve, derived from the Cash 100bb PTO preflop charts:
 *  - srp: every opener/caller pair with a calling range (single-raised pot)
 *  - 3bp: every opener/3-bettor pair where the opener has a calling range vs the 3-bet
 * Pot and stack follow the cash sizing profile (2.5bb open, SB opens 3bb, 3-bets 3x in
 * position and 5x from the blinds with a 7bb floor).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Postflop acting order: blinds first, button last. Later = in position. */
const POSTFLOP_ORDER = ['SB', 'BB', 'LJ', 'HJ', 'CO', 'BTN']
const BLINDS = { SB: 0.5, BB: 1 }

/** Bet-size tree in percent of pot. Kept small so a flop solves in a minute or two. */
export const TREE = {
  flop: { bet: [33], raise: [50] },
  turn: { bet: [50], raise: [50] },
  river: { bet: [50], raise: [50] },
  allinThreshold: 0.67,
}

/** How many boards from the subset to solve per spot kind. */
const FLOPS_PER_KIND = { srp: 25, '3bp': 10 }

function compactRange(text) {
  return text.replace(/\s+/g, '')
}

function openSize(position) {
  return position === 'SB' ? 3 : 2.5
}

function threeBetSize(threeBettor, opener) {
  const inBlinds = threeBettor === 'SB' || threeBettor === 'BB'
  return Math.max(7, Math.round(openSize(opener) * (inBlinds ? 5 : 3) * 10) / 10)
}

function deadBlinds(involved) {
  return Object.entries(BLINDS).reduce((sum, [pos, amount]) => sum + (involved.includes(pos) ? 0 : amount), 0)
}

function inPosition(a, b) {
  return POSTFLOP_ORDER.indexOf(a) > POSTFLOP_ORDER.indexOf(b)
}

function buildSpots() {
  const entries = JSON.parse(readFileSync(path.join(root, 'public', 'ranges', 'Cash_100_PTO.json'), 'utf8'))
  const openRange = (opener) => {
    const open = entries.find((e) => e.scenario === 'open' && e.hero.includes(opener) && (!e.players || e.players.includes(6)))
    return open?.range.raise
  }
  const spots = []
  for (const entry of entries) {
    if (entry.scenario === 'vs-raise' && entry.range.call) {
      const caller = entry.hero[0]
      for (const opener of entry.villain) {
        const open = openRange(opener)
        if (!open) continue
        const openerIp = inPosition(opener, caller)
        const bet = openSize(opener)
        spots.push(
          spot('srp', { opener, caller }, openerIp ? opener : caller, openerIp ? caller : opener, openerIp ? open : entry.range.call, openerIp ? entry.range.call : open, {
            pot: bet * 2 + deadBlinds([opener, caller]),
            stack: 100 - bet,
          }),
        )
      }
    }
    if (entry.scenario === 'vs-3bet' && entry.range.call) {
      const opener = entry.hero[0]
      for (const threeBettor of entry.villain) {
        const threeBet = entries.find((e) => e.scenario === 'vs-raise' && e.hero.includes(threeBettor) && e.villain.includes(opener))?.range.raise
        if (!threeBet || !openRange(opener)) continue
        const openerIp = inPosition(opener, threeBettor)
        const size = threeBetSize(threeBettor, opener)
        spots.push(
          spot('3bp', { opener, threeBettor }, openerIp ? opener : threeBettor, openerIp ? threeBettor : opener, openerIp ? entry.range.call : threeBet, openerIp ? threeBet : entry.range.call, {
            pot: size * 2 + deadBlinds([opener, threeBettor]),
            stack: 100 - size,
          }),
        )
      }
    }
  }
  return spots
}

function spot(kind, roles, ip, oop, ipRange, oopRange, { pot, stack }) {
  const id = kind === 'srp' ? `srp-${roles.opener}-${roles.caller}` : `3bp-${roles.opener}-${roles.threeBettor}`
  return {
    id,
    kind,
    ...roles,
    ip,
    oop,
    ipRange: compactRange(ipRange),
    oopRange: compactRange(oopRange),
    pot: Math.round(pot * 10) / 10,
    stack: Math.round(stack * 10) / 10,
    flops: FLOPS_PER_KIND[kind],
  }
}

export const POSTFLOP_SPOTS = buildSpots()

if (process.argv[1] && process.argv[1].endsWith('postflop-spots.mjs')) {
  for (const s of POSTFLOP_SPOTS) console.log(s.id.padEnd(14), `ip=${s.ip} oop=${s.oop} pot=${s.pot} stack=${s.stack} flops=${s.flops}`)
  console.log(POSTFLOP_SPOTS.length, 'spots,', POSTFLOP_SPOTS.reduce((n, s) => n + s.flops, 0), 'solves')
}

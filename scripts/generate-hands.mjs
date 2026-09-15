/**
 * Generate scripted full hands from the solved flops in data/postflop/flops.
 *
 * For each solved board the script samples a hero hand and a villain hand from the
 * spot's ranges, walks the flop along the solver's line (the hero takes the most
 * frequent action, the villain samples from their frequencies), re-solves turn and
 * river as a subgame from the reach ranges after the flop, walks those streets the
 * same way, and evaluates the showdown. Only the nodes on that line are stored, with
 * the hero's frequencies and a 169-hand summary at each of the hero's decisions.
 *
 * Output: public/full-hands/<spotId>/<board>-<n>.json plus public/full-hands/index.json.
 *
 *   TEXASSOLVER_BIN=/path/to/console_solver node scripts/generate-hands.mjs [--per-board 6] [--spots a,b] [--kind srp|3bp] [--seed 1]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DECK, lookup, seededRng, shuffle, weightedPick } from './lib/cards.mjs'
import { aggregateGrid } from './lib/aggregate.mjs'
import { evaluateHand } from './lib/handEval.mjs'
import { expandRange, rangeString } from './lib/ranges.mjs'
import { argReader, betSizeLines, compactAction, compactStrategy, runSolver, SCALE, solverBinary } from './lib/solver.mjs'
import { POSTFLOP_SPOTS, TREE } from './postflop-spots.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const flopsRoot = path.join(root, 'data', 'postflop', 'flops')
const outRoot = path.join(root, 'public', 'full-hands')
const workDir = path.join(os.tmpdir(), 'open-range-viewer-hands')
const bin = solverBinary()

const opt = argReader(process.argv.slice(2))
const perBoard = Number(opt('per-board', 6))
const spotFilter = opt('spots', '').split(',').filter(Boolean)
const kindFilter = opt('kind', '')
const seed = Number(opt('seed', 1))

const other = (p) => (p === 'ip' ? 'oop' : 'ip')
const argmax = (probs) => probs.reduce((best, p, i) => (p > probs[best] ? i : best), 0)
const sampleIndex = (probs, rng) => {
  const total = probs.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (let i = 0; i < probs.length; i++) {
    roll -= probs[i]
    if (roll <= 0) return i
  }
  return probs.length - 1
}
const round1 = (n) => Math.round(n * 10) / 10

// ------------------------------------------------------------ Raw solver nodes

/** View a raw dump node as a compact node whose children are resolved on demand. */
function viewRaw(raw, stack) {
  if (!raw || raw.node_type !== 'action_node') return null
  return {
    p: raw.player === 0 ? 'ip' : 'oop',
    actions: raw.actions.map((label) => compactAction(label, stack)),
    s: compactStrategy(raw),
    child: (i) => {
      const child = raw.childrens?.[raw.actions[i]]
      if (!child) return { kind: 'end' }
      if (child.node_type === 'chance_node') return { kind: 'chance', deal: (card) => viewRaw(child.dealcards?.[card], stack) }
      return { kind: 'node', node: viewRaw(child, stack) }
    },
  }
}

/** View a compact flop-file node with the same interface. */
function viewCompact(node) {
  if (!node) return null
  return {
    p: node.p,
    actions: node.actions,
    s: node.s,
    child: (i) => {
      const child = node.c[i]
      return child ? { kind: 'node', node: viewCompact(child) } : { kind: 'chance', deal: () => null }
    },
  }
}

// ------------------------------------------------------------------ Walking

/**
 * Play one street from `node`. Returns the recorded nodes and how the street ended:
 * fold (hand over), end (bets matched, hand continues), or all-in.
 */
function walkStreet(node, ctx) {
  const nodes = []
  const bets = { ip: 0, oop: 0 }
  while (node) {
    const acting = node.p
    const combo = acting === ctx.heroPlayer ? ctx.heroCombo : ctx.villainCombo
    const probs = lookup(node.s, combo.slice(0, 2), combo.slice(2, 4))
    if (!probs) throw new Error(`No strategy for ${combo} at a ${acting} node`)
    const isHero = acting === ctx.heroPlayer
    const chosen = isHero ? argmax(probs) : sampleIndex(probs, ctx.rng)
    // Solver amounts are the chips added now; store the resulting street total too and label all-ins as such.
    const actions = node.actions.map((action) => {
      if (action.a === 'C') return { a: 'C', to: bets[other(acting)] }
      if (action.bb === undefined) return { a: action.a }
      const to = round1(bets[acting] + action.bb)
      return to >= ctx.stack - 0.05 ? { a: 'AI', bb: round1(ctx.stack - bets[acting]), to: ctx.stack } : { a: action.a, bb: action.bb, to }
    })
    const record = { p: acting, actions, chosen }
    if (isHero) {
      record.probs = probs
      record.grid = aggregateGrid(node.s)
    }
    nodes.push(record)
    ctx.reach[acting].push({ s: node.s, chosen })
    const action = actions[chosen]
    if (action.to !== undefined) bets[acting] = action.to
    if (action.a === 'F') return { nodes, bets, end: 'fold', folder: acting }
    const next = node.child(chosen)
    if (next.kind === 'node') {
      node = next.node
      continue
    }
    const allIn = bets.ip >= ctx.stack - 0.05 && bets.oop >= ctx.stack - 0.05
    return { nodes, bets, end: allIn ? 'all-in' : 'end', chance: next.kind === 'chance' ? next : null }
  }
  throw new Error('Street ended without a node')
}

/** Reach-weighted range after the streets played so far. */
function reachRange(baseRange, decisions) {
  const out = {}
  for (const [combo, w0] of Object.entries(baseRange)) {
    let w = w0
    for (const { s, chosen } of decisions) {
      const probs = lookup(s, combo.slice(0, 2), combo.slice(2, 4))
      w *= (probs?.[chosen] ?? 0) / 100
      if (w === 0) break
    }
    if (w > 0.0005) out[combo] = w
  }
  return out
}

// -------------------------------------------------------------- Turn solve

function solveTurn(board, pot, stack, ipRange, oopRange, tag) {
  const body =
    `set_pot ${Math.round(pot * SCALE)}\nset_effective_stack ${Math.round(stack * SCALE)}\nset_board ${board.join(',')}\n` +
    `set_range_ip ${rangeString(ipRange)}\nset_range_oop ${rangeString(oopRange)}\n` +
    betSizeLines(TREE, ['turn', 'river']) +
    `set_allin_threshold ${TREE.allinThreshold}\n`
  // Exact-combo ranges are not suit-symmetric, so isomorphism stays off.
  const { raw, exploitability } = runSolver(bin, tag, body, { iterations: 200, accuracy: 0.2, dumpRounds: 2, isomorphism: 0, workDir })
  return { root: viewRaw(raw, stack), exploit: exploitability }
}

// ------------------------------------------------------------- One script

function generateScript(spot, flopFile, heroPlayer, rng, tag) {
  const board = [...flopFile.board]
  const ipBase = expandRange(spot.ipRange, board)
  const oopBase = expandRange(spot.oopRange, board)
  const heroBase = heroPlayer === 'ip' ? ipBase : oopBase
  const villainBase = heroPlayer === 'ip' ? oopBase : ipBase
  const heroCombo = weightedPick(
    Object.entries(heroBase).map(([item, weight]) => ({ item, weight })),
    rng,
  )
  const heroCards = [heroCombo.slice(0, 2), heroCombo.slice(2, 4)]
  const villainCombo = weightedPick(
    Object.entries(villainBase)
      .filter(([c]) => !heroCards.includes(c.slice(0, 2)) && !heroCards.includes(c.slice(2, 4)))
      .map(([item, weight]) => ({ item, weight })),
    rng,
  )
  const villainCards = [villainCombo.slice(0, 2), villainCombo.slice(2, 4)]
  const used = new Set([...board, ...heroCards, ...villainCards])
  const deck = shuffle(
    DECK.filter((c) => !used.has(c)),
    rng,
  )
  const nextCard = () => deck.pop()

  const ctx = { heroPlayer, heroCombo, villainCombo, rng, stack: spot.stack, reach: { ip: [], oop: [] } }
  const streets = []
  let pot = spot.pot
  let stack = spot.stack
  let exploitability = { flop: flopFile.exploitability }

  const finish = (end, bets, folder) => {
    pot = round1(pot + bets.ip + bets.oop)
    if (end === 'fold') {
      return { kind: 'fold', winner: folder === heroPlayer ? 'villain' : 'hero', pot }
    }
    while (board.length < 5) board.push(nextCard())
    const hero = evaluateHand([...heroCards, ...board])
    const villain = evaluateHand([...villainCards, ...board])
    return { kind: 'showdown', winner: hero.score > villain.score ? 'hero' : hero.score < villain.score ? 'villain' : 'split', pot, heroHand: hero.name, villainHand: villain.name }
  }

  // Flop from the pre-solved file.
  const flop = walkStreet(viewCompact(flopFile.root), ctx)
  streets.push({ street: 'flop', pot, nodes: flop.nodes })
  if (flop.end !== 'end') return build(finish(flop.end, flop.bets, flop.folder))
  pot = round1(pot + flop.bets.ip + flop.bets.oop)
  stack = round1(stack - flop.bets.ip)
  ctx.stack = stack

  // Turn and river from a subgame solve on the reach ranges.
  board.push(nextCard())
  const solved = solveTurn(board, pot, stack, reachRange(ipBase, ctx.reach.ip), reachRange(oopBase, ctx.reach.oop), tag)
  exploitability.turn = solved.exploit
  const turn = walkStreet(solved.root, ctx)
  streets.push({ street: 'turn', pot, nodes: turn.nodes })
  if (turn.end !== 'end') return build(finish(turn.end, turn.bets, turn.folder))
  pot = round1(pot + turn.bets.ip + turn.bets.oop)
  stack = round1(stack - turn.bets.ip)
  ctx.stack = stack

  board.push(nextCard())
  const riverRoot = turn.chance?.deal(board[4])
  if (!riverRoot) throw new Error(`No river node for ${board[4]}`)
  const river = walkStreet(riverRoot, ctx)
  streets.push({ street: 'river', pot, nodes: river.nodes })
  return build(finish(river.end === 'end' ? 'showdown' : river.end, river.bets, river.folder))

  function build(result) {
    return {
      spot: spot.id,
      kind: spot.kind,
      opener: spot.opener,
      caller: spot.caller,
      threeBettor: spot.threeBettor,
      hero: heroPlayer === 'ip' ? spot.ip : spot.oop,
      villain: heroPlayer === 'ip' ? spot.oop : spot.ip,
      heroPlayer,
      heroCards,
      villainCards,
      board,
      pot: spot.pot,
      stack: spot.stack,
      exploitability,
      streets,
      result,
    }
  }
}

// ------------------------------------------------------------------ Batch

function writeIndex() {
  const index = { spots: {}, hands: [] }
  for (const spot of POSTFLOP_SPOTS) {
    const dir = path.join(outRoot, spot.id)
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    if (!files.length) continue
    index.spots[spot.id] = { kind: spot.kind, opener: spot.opener, caller: spot.caller, threeBettor: spot.threeBettor, ip: spot.ip, oop: spot.oop, pot: spot.pot, stack: spot.stack }
    for (const file of files) {
      const script = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
      index.hands.push({ id: `${spot.id}/${file.replace(/\.json$/, '')}`, spot: spot.id, hero: script.hero, result: script.result.kind })
    }
  }
  writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(index))
  return index.hands.length
}

const spots = POSTFLOP_SPOTS.filter((s) => (!spotFilter.length || spotFilter.includes(s.id)) && (!kindFilter || s.kind === kindFilter))
let made = 0
for (const spot of spots) {
  const flopDir = path.join(flopsRoot, spot.id)
  if (!existsSync(flopDir)) continue
  for (const file of readdirSync(flopDir).filter((f) => f.endsWith('.json'))) {
    const boardId = file.replace(/\.json$/, '')
    const flopFile = JSON.parse(readFileSync(path.join(flopDir, file), 'utf8'))
    const outDir = path.join(outRoot, spot.id)
    mkdirSync(outDir, { recursive: true })
    for (let n = 0; n < perBoard; n++) {
      const outFile = path.join(outDir, `${boardId}-${n}.json`)
      if (existsSync(outFile)) continue
      const rng = seededRng(seed * 1_000_003 + hashCode(`${spot.id}/${boardId}/${n}`))
      const heroPlayer = n % 2 === 0 ? 'oop' : 'ip'
      const started = Date.now()
      try {
        const script = generateScript(spot, flopFile, heroPlayer, rng, `${spot.id}-${boardId}-${n}`)
        writeFileSync(outFile, JSON.stringify(script))
        made++
        const secs = ((Date.now() - started) / 1000).toFixed(1)
        console.log(`${spot.id} ${boardId}-${n} hero=${script.hero} ${script.heroCards.join('')} vs ${script.villainCards.join('')} board=${script.board.join('')} ${script.result.kind}:${script.result.winner} ${secs}s`)
      } catch (err) {
        console.error(`${spot.id} ${boardId}-${n} FAILED: ${err.message.split('\n')[0]}`)
      }
    }
  }
}
const total = writeIndex()
console.log(`${made} new scripted hands, ${total} total in the index`)

function hashCode(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return h >>> 0
}

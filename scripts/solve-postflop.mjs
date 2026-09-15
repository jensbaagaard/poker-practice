/**
 * Solve the flop for every heads-up postflop spot and every board in the subset.
 *
 * Each solve covers the whole flop-to-river game; only the flop nodes are kept,
 * compacted into data/postflop/flops/<spotId>/<board>.json as input for
 * scripts/generate-hands.mjs (not served). Existing files are skipped so the job
 * can be resumed, and the index is rewritten after every solve.
 *
 *   TEXASSOLVER_BIN=/path/to/console_solver node scripts/solve-postflop.mjs [--spots srp-BTN-BB,...] [--kind srp|3bp] [--flops 5] [--iterations 120]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { argReader, betSizeLines, compactAction, compactStrategy, runSolver, SCALE, solverBinary } from './lib/solver.mjs'
import { POSTFLOP_SPOTS, TREE } from './postflop-spots.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = path.join(root, 'data', 'postflop', 'flops')
const workDir = path.join(os.tmpdir(), 'open-range-viewer-solves')
const bin = solverBinary()

const opt = argReader(process.argv.slice(2))
const spotFilter = opt('spots', '').split(',').filter(Boolean)
const kindFilter = opt('kind', '')
const flopLimit = Number(opt('flops', Infinity))
const iterations = Number(opt('iterations', 120))

const flopsAll = JSON.parse(readFileSync(path.join(root, 'data', 'postflop', 'flops-25.json'), 'utf8'))
const flops = flopsAll.slice(0, flopLimit)
const spots = POSTFLOP_SPOTS.filter((s) => (!spotFilter.length || spotFilter.includes(s.id)) && (!kindFilter || s.kind === kindFilter))

function compactNode(node, stack) {
  if (node.node_type !== 'action_node') return null
  return {
    p: node.player === 0 ? 'ip' : 'oop',
    actions: node.actions.map((label) => compactAction(label, stack)),
    s: compactStrategy(node),
    c: node.actions.map((label) => (node.childrens?.[label] ? compactNode(node.childrens[label], stack) : null)),
  }
}

function solveBoard(spot, flop, outFile) {
  const body =
    `set_pot ${spot.pot * SCALE}\nset_effective_stack ${spot.stack * SCALE}\nset_board ${flop.board.join(',')}\n` +
    `set_range_ip ${spot.ipRange}\nset_range_oop ${spot.oopRange}\n` +
    betSizeLines(TREE, ['flop', 'turn', 'river']) +
    `set_allin_threshold ${TREE.allinThreshold}\n`
  const { raw, exploitability } = runSolver(bin, `${spot.id}-${flop.board.join('')}`, body, { iterations, accuracy: 0.3, dumpRounds: 1, workDir })
  writeFileSync(outFile, JSON.stringify({ spot: spot.id, board: flop.board, weight: flop.weight, pot: spot.pot, stack: spot.stack, exploitability, root: compactNode(raw, spot.stack) }))
  return exploitability
}

/** Index of everything solved so far, read by generate-hands.mjs. */
function writeIndex() {
  const index = { spots: {} }
  for (const spot of POSTFLOP_SPOTS) {
    const spotDir = path.join(outRoot, spot.id)
    if (!existsSync(spotDir)) continue
    const boards = readdirSync(spotDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => flopsAll.find((fl) => fl.board.join('') === f.replace(/\.json$/, '')))
      .filter(Boolean)
      .map((fl) => ({ board: fl.board, weight: fl.weight }))
    if (boards.length) index.spots[spot.id] = { kind: spot.kind, opener: spot.opener, caller: spot.caller, threeBettor: spot.threeBettor, ip: spot.ip, oop: spot.oop, pot: spot.pot, stack: spot.stack, boards }
  }
  writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(index))
}

let done = 0
const total = spots.reduce((n, s) => n + Math.min(s.flops, flops.length), 0)
for (const [flopIndex, flop] of flops.entries()) {
  for (const spot of spots) {
    if (flopIndex >= spot.flops) continue
    const boardId = flop.board.join('')
    const outFile = path.join(outRoot, spot.id, `${boardId}.json`)
    done++
    if (existsSync(outFile)) continue
    mkdirSync(path.dirname(outFile), { recursive: true })
    const started = Date.now()
    let exploitability
    for (let attempt = 1; attempt <= 2 && exploitability === undefined; attempt++) {
      try {
        exploitability = solveBoard(spot, flop, outFile)
      } catch (err) {
        console.error(`[${done}/${total}] ${spot.id} ${boardId}  FAILED (attempt ${attempt}): ${err.message.split('\n')[0]}`)
      }
    }
    if (exploitability === undefined) continue
    writeIndex()
    console.log(`[${done}/${total}] ${spot.id} ${boardId}  ${Math.round((Date.now() - started) / 1000)}s  exploitability ${exploitability}%`)
  }
}

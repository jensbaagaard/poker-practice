/**
 * Generate flop strategies for heads-up postflop spots with TexasSolver.
 *
 * For every spot (who opened, who called/3-bet, pot and stack going to the flop)
 * and every flop in the subset, the script writes a TexasSolver input file, runs
 * the console solver, and compacts the flop nodes of the result into
 * public/postflop/<spotId>/<board>.json. Existing files are skipped so the job
 * can be resumed.
 *
 * Requires the TexasSolver console binary (AGPL, run as a separate program):
 *   TEXASSOLVER_BIN=/path/to/console_solver node scripts/solve-postflop.mjs [--spots srp-BTN-BB,...] [--flops 5] [--iterations 120]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POSTFLOP_SPOTS, TREE } from './postflop-spots.mjs'

/** The solver rounds amounts to whole chips, so solve in tenths of a big blind. */
const SCALE = 10

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = path.join(root, 'public', 'postflop')
const workDir = path.join(os.tmpdir(), 'open-range-viewer-solves')
const bin = process.env.TEXASSOLVER_BIN
if (!bin || !existsSync(bin)) {
  console.error('Set TEXASSOLVER_BIN to the TexasSolver console_solver binary.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const spotFilter = opt('spots', '')?.split(',').filter(Boolean)
const flopLimit = Number(opt('flops', Infinity))
const iterations = Number(opt('iterations', 120))
const threads = Number(opt('threads', Math.min(12, Math.max(2, os.cpus().length - 2))))

const flopsAll = JSON.parse(readFileSync(path.join(root, 'data', 'postflop', 'flops-25.json'), 'utf8'))
const flops = flopsAll.slice(0, flopLimit)
const spots = POSTFLOP_SPOTS.filter((s) => !spotFilter.length || spotFilter.includes(s.id))

mkdirSync(workDir, { recursive: true })

function sizes(who, street, kind, values) {
  if (!values || values.length === 0) return ''
  return `set_bet_sizes ${who},${street},${kind},${values.join(',')}\n`
}

function inputFor(spot, board, resultPath) {
  let text = `set_pot ${spot.pot * SCALE}\nset_effective_stack ${spot.stack * SCALE}\nset_board ${board.join(',')}\n`
  text += `set_range_ip ${spot.ipRange}\nset_range_oop ${spot.oopRange}\n`
  for (const street of ['flop', 'turn', 'river']) {
    for (const who of ['oop', 'ip']) {
      text += sizes(who, street, 'bet', TREE[street].bet)
      text += sizes(who, street, 'raise', TREE[street].raise)
      text += `set_bet_sizes ${who},${street},allin\n`
    }
  }
  text += `set_allin_threshold ${TREE.allinThreshold}\nbuild_tree\nset_thread_num ${threads}\nset_accuracy 0.3\n`
  text += `set_max_iteration ${iterations}\nset_print_interval 10\nset_use_isomorphism 1\nstart_solve\nset_dump_rounds 1\ndump_result ${resultPath}\n`
  return text
}

/** Action label as the app shows it: X, B<pct>, R<pct>, AI, C, F. Amount is the total bet in bb. */
function compactAction(label, stack) {
  const [kind, amountStr] = label.split(' ')
  const amount = amountStr === undefined ? undefined : Number(amountStr) / SCALE
  switch (kind) {
    case 'CHECK':
      return { a: 'X' }
    case 'CALL':
      return { a: 'C' }
    case 'FOLD':
      return { a: 'F' }
    case 'BET':
    case 'RAISE':
      return amount >= stack * 0.99 ? { a: 'AI', bb: stack } : { a: kind === 'BET' ? 'B' : 'R', bb: amount }
    default:
      throw new Error(`Unknown action ${label}`)
  }
}

function compactNode(node, spot) {
  if (node.node_type !== 'action_node') return null
  const actions = node.actions.map((label) => compactAction(label, spot.stack))
  const strategy = {}
  for (const [combo, probs] of Object.entries(node.strategy.strategy)) {
    strategy[combo] = probs.map((p) => Math.round(p * 100))
  }
  const children = node.actions.map((label) => {
    const child = node.childrens?.[label]
    return child ? compactNode(child, spot) : null
  })
  return { p: node.player === 0 ? 'ip' : 'oop', actions, s: strategy, c: children }
}

/** Index of everything solved so far, read by the app to know which spots and boards exist. */
function writeManifest() {
  const manifest = { spots: {} }
  for (const spot of POSTFLOP_SPOTS) {
    const spotDir = path.join(outRoot, spot.id)
    if (!existsSync(spotDir)) continue
    const boards = readdirSync(spotDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .map((id) => flopsAll.find((fl) => fl.board.join('') === id))
      .filter(Boolean)
      .map((fl) => ({ board: fl.board, weight: fl.weight }))
    if (boards.length) manifest.spots[spot.id] = { kind: spot.kind, opener: spot.opener, caller: spot.caller, ip: spot.ip, oop: spot.oop, pot: spot.pot, stack: spot.stack, boards }
  }
  writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(manifest))
}

function solveOnce(inputPath, resultPath, spot, flop, outFile) {
  // The solver loads its hand-ranking tables from ./resources, so run it from its own folder.
  const log = execFileSync(bin, ['-i', inputPath], { cwd: path.dirname(bin), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const exploit = [...log.matchAll(/Total exploitability ([\d.]+)/g)].pop()?.[1]
  const raw = JSON.parse(readFileSync(resultPath, 'utf8'))
  const compact = {
    spot: spot.id,
    board: flop.board,
    weight: flop.weight,
    pot: spot.pot,
    stack: spot.stack,
    exploitability: Number(exploit),
    root: compactNode(raw, spot),
  }
  writeFileSync(outFile, JSON.stringify(compact))
  return exploit
}

let done = 0
const total = spots.length * flops.length
for (const flop of flops) {
  for (const spot of spots) {
    const spotDir = path.join(outRoot, spot.id)
    mkdirSync(spotDir, { recursive: true })
    const boardId = flop.board.join('')
    const outFile = path.join(spotDir, `${boardId}.json`)
    done++
    if (existsSync(outFile)) continue
    const resultPath = path.join(workDir, `${spot.id}-${boardId}.json`)
    const inputPath = path.join(workDir, `${spot.id}-${boardId}.txt`)
    writeFileSync(inputPath, inputFor(spot, flop.board, resultPath))
    const started = Date.now()
    let exploit
    try {
      exploit = solveOnce(inputPath, resultPath, spot, flop, outFile)
    } catch (err) {
      console.error(`[${done}/${total}] ${spot.id} ${boardId}  FAILED: ${err.message.split('\n')[0]} — retrying once`)
      try {
        exploit = solveOnce(inputPath, resultPath, spot, flop, outFile)
      } catch (err2) {
        console.error(`[${done}/${total}] ${spot.id} ${boardId}  FAILED AGAIN: ${err2.message.split('\n')[0]} — skipped`)
        rmSync(resultPath, { force: true })
        continue
      }
    }
    writeManifest()
    rmSync(resultPath, { force: true })
    rmSync(inputPath, { force: true })
    const secs = Math.round((Date.now() - started) / 1000)
    console.log(`[${done}/${total}] ${spot.id} ${boardId}  ${secs}s  exploitability ${exploit}%`)
  }
}

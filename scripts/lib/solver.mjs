import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The solver rounds amounts to whole chips, so solve in tenths of a big blind. */
export const SCALE = 10

const THREADS = Math.min(12, Math.max(2, os.cpus().length - 2))

export function solverBinary() {
  const bin = process.env.TEXASSOLVER_BIN
  if (!bin || !existsSync(bin)) {
    console.error('Set TEXASSOLVER_BIN to the TexasSolver console_solver binary.')
    process.exit(1)
  }
  return bin
}

/** Simple `--name value` argument reader. */
export function argReader(args) {
  return (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : fallback
  }
}

/** `set_bet_sizes` lines for the given streets from a bet-size tree (percent of pot). */
export function betSizeLines(tree, streets) {
  let text = ''
  for (const street of streets) {
    for (const who of ['oop', 'ip']) {
      for (const kind of ['bet', 'raise']) {
        const values = tree[street][kind]
        if (values && values.length) text += `set_bet_sizes ${who},${street},${kind},${values.join(',')}\n`
      }
      text += `set_bet_sizes ${who},${street},allin\n`
    }
  }
  return text
}

/**
 * Run one solve. `body` holds everything from set_pot to the tree settings; the
 * function adds the solve and dump commands, runs the binary from its own folder
 * (it reads ./resources), and returns the parsed dump with the last reported
 * exploitability. Work files are removed afterwards.
 */
export function runSolver(bin, tag, body, { iterations, accuracy, dumpRounds, isomorphism = 1, workDir }) {
  mkdirSync(workDir, { recursive: true })
  const resultPath = path.join(workDir, `${tag}.json`)
  const inputPath = path.join(workDir, `${tag}.txt`)
  const text =
    body +
    `build_tree\nset_thread_num ${THREADS}\nset_accuracy ${accuracy}\nset_max_iteration ${iterations}\nset_print_interval 10\n` +
    `set_use_isomorphism ${isomorphism}\nstart_solve\nset_dump_rounds ${dumpRounds}\ndump_result ${resultPath}\n`
  writeFileSync(inputPath, text)
  try {
    const log = execFileSync(bin, ['-i', inputPath], { cwd: path.dirname(bin), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const exploitability = Number([...log.matchAll(/Total exploitability ([\d.]+)/g)].pop()?.[1])
    const raw = JSON.parse(readFileSync(resultPath, 'utf8'))
    return { raw, exploitability }
  } finally {
    rmSync(resultPath, { force: true })
    rmSync(inputPath, { force: true })
  }
}

/** Convert a raw TexasSolver action label to the compact form: kind plus the chips added, in bb. */
export function compactAction(label, stack) {
  const [kind, amountText] = label.split(' ')
  const amount = amountText === undefined ? undefined : Number(amountText) / SCALE
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

/** Per-combo strategy of a raw action node as integer percentages. */
export function compactStrategy(raw) {
  const out = {}
  for (const [combo, probs] of Object.entries(raw.strategy.strategy)) out[combo] = probs.map((p) => Math.round(p * 100))
  return out
}

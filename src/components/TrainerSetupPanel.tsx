"use client";

import { useState } from "react";
import {
  PLAYER_COUNTS,
  POSITION_LABELS,
  positionsFor,
  type Position,
} from "@/lib/positions";
import type { TrainerSetup } from "@/lib/trainer";
import {
  FORMAT_LABELS,
  FORMATS,
  hasOpenSizeChoice,
  OPEN_SIZES,
  RANGE_TYPE_LABELS,
  rangeTypeOptions,
  stackOptions,
  type Format,
  type RangeType,
} from "@/lib/scenarios";
import { Segmented } from "./Segmented";

interface Props {
  setup: TrainerSetup;
  onChange: (patch: Partial<TrainerSetup>) => void;
  /** Full hands are fixed to one chart set; only the seat can be chosen. */
  seatOnly?: boolean;
}

export function TrainerSetupPanel({ setup, onChange, seatOnly }: Props) {
  const [open, setOpen] = useState(false);
  const stacks = stackOptions(setup.format);

  return (
    <div className="card" style={{ padding: 0 }}>
      <button
        type="button"
        className="setup-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="setup-toggle__left">Game setup</span>
        <span aria-hidden>{open ? "︿" : "﹀"}</span>
      </button>

      {open && (
        <div className="setup-body">
          {seatOnly && (
            <p className="editor__help">
              Full hands are generated from the Cash 100bb PTO charts at a 6-max
              table.
            </p>
          )}
          {!seatOnly && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">Format</div>
                <Segmented<Format>
                  ariaLabel="Format"
                  options={FORMATS.map((f) => ({
                    value: f,
                    label: FORMAT_LABELS[f],
                  }))}
                  value={setup.format}
                  onChange={(format) => onChange({ format })}
                />
              </div>
            </div>
          )}
          {!seatOnly && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">Players</div>
                <Segmented<number>
                  ariaLabel="Players"
                  options={PLAYER_COUNTS.map((p) => ({
                    value: p,
                    label: String(p),
                  }))}
                  value={setup.players}
                  onChange={(players) =>
                    onChange({ players: players as TrainerSetup["players"] })
                  }
                />
              </div>
            </div>
          )}
          <div className="subcard">
            <div className="field">
              <div className="field__label">Your seat</div>
              <Segmented<Position | "random">
                ariaLabel="Your seat"
                options={[
                  { value: "random", label: "Random" },
                  ...positionsFor(setup.players).map((p) => ({
                    value: p,
                    label: POSITION_LABELS[p],
                  })),
                ]}
                value={setup.seat ?? "random"}
                onChange={(seat) =>
                  onChange({ seat: seat === "random" ? undefined : seat })
                }
              />
            </div>
          </div>
          {!seatOnly && stacks.length > 1 && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">Stack</div>
                <Segmented<number>
                  ariaLabel="Stack"
                  options={stacks.map((s) => ({ value: s, label: `${s} bb` }))}
                  value={setup.stack}
                  onChange={(stack) =>
                    onChange({ stack: stack as TrainerSetup["stack"] })
                  }
                />
              </div>
            </div>
          )}
          {!seatOnly && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">
                  Range Type
                  <span
                    className="info"
                    title="PTO charts play one action per hand, so every question has a single right answer. Mixed charts grade a less frequent action as partially correct."
                  >
                    i
                  </span>
                </div>
                <Segmented<RangeType>
                  ariaLabel="Range type"
                  options={rangeTypeOptions(setup.format).map((t) => ({
                    value: t,
                    label: RANGE_TYPE_LABELS[t],
                  }))}
                  value={setup.rangeType}
                  onChange={(rangeType) => onChange({ rangeType })}
                />
              </div>
            </div>
          )}
          {!seatOnly && hasOpenSizeChoice(setup) && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">Open size</div>
                <Segmented<number>
                  ariaLabel="Open size"
                  options={OPEN_SIZES.map((s) => ({
                    value: s,
                    label: `${s} bb`,
                  }))}
                  value={setup.openSize}
                  onChange={(openSize) =>
                    onChange({ openSize: openSize as TrainerSetup["openSize"] })
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

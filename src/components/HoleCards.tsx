import { cardLabel, SUIT_SYMBOLS, type Card, type HoleCards as Cards } from '@/lib/cards'

export function CardFace({ card, small }: { card: Card; small?: boolean }) {
  const red = card.suit === 'h' || card.suit === 'd'
  return (
    <div className={`playing-card${red ? ' playing-card--red' : ''}${small ? ' playing-card--small' : ''}`} aria-label={cardLabel(card)}>
      <span className="playing-card__rank">{card.rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}

export function HoleCards({ cards }: { cards: Cards }) {
  return (
    <div className="hole-cards" role="img" aria-label={`Your hand: ${cardLabel(cards[0])} ${cardLabel(cards[1])}`}>
      <CardFace card={cards[0]} />
      <CardFace card={cards[1]} />
    </div>
  )
}

export function BoardCards({ cards, pot }: { cards: Card[]; pot?: number }) {
  return (
    <div className="board">
      <div className="board__cards" role="img" aria-label={`Board: ${cards.map(cardLabel).join(' ')}`}>
        {cards.map((c) => (
          <CardFace key={cardLabel(c)} card={c} small />
        ))}
      </div>
      {pot !== undefined && <div className="board__pot">Pot {pot}bb</div>}
    </div>
  )
}

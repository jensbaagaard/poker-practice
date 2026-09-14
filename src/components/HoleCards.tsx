import { cardLabel, SUIT_SYMBOLS, type Card, type HoleCards as Cards } from '@/lib/cards'

function CardFace({ card }: { card: Card }) {
  const red = card.suit === 'h' || card.suit === 'd'
  return (
    <div className={`playing-card${red ? ' playing-card--red' : ''}`} aria-label={cardLabel(card)}>
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

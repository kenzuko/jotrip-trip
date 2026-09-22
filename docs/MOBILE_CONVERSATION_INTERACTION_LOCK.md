# Mobile Conversation Interaction Lock

## Product feeling

JoTrip mobile must feel like a conversation with a capable person on the island, not a tourism website compressed onto a phone.

The page should answer in this order:

1. JoTrip speaks.
2. JoTrip gives a small number of things worth noticing.
3. JoTrip places meaningful alternatives side by side.
4. Evidence opens behind the advice.
5. The guest asks a follow-up without losing context.
6. Booking appears only after the guest is comfortable with the direction.

## Entry state

First screen:

- JoTrip mascot is visible as a character.
- JoTrip greets before selling anything.
- headline: **Tri thức Phú Quốc biết trò chuyện.**
- one open natural-language composer
- a small number of example questions
- no hotel grid
- no booking CTA
- no fake price urgency

Greeting:

> Chào bạn. Mình là JoTrip. Bạn đang tính chuyến đi Phú Quốc thế nào?

## Active conversation state

After the first user question:

- large landing-page hero collapses
- JoTrip character stays present
- follow-up composer remains within thumb reach at the bottom
- conversation context is preserved
- old detail blocks do not take over the page

The mascot has semantic states:

- greeting / idle
- listening
- thinking
- speaking
- comparing / pointing

Animation must remain subtle. The mascot is a guide, not an advertising animation.

## Advice before evidence

A normal answer should prefer:

**1 main view -> 2 or 3 practical cautions -> evidence**

Do not dump a hotel list before JoTrip has explained the decision.

Detailed hotel cards stay behind an evidence drawer during planning.

## Two-direction comparison

When two stay directions create a real trade-off, JoTrip may show a swipeable comparison canvas.

Examples:

- North vs Duong Dong
- South vs Duong Dong
- North vs South
- Long Beach vs a destination-heavy area

Never manufacture a second direction only for symmetry.

Each direction explains:

- **Được** - what becomes easier
- **Đổi lại** - what becomes less convenient

No winner badge.
No 87/100 public score.
No “best option” unless the guest has explicitly supplied a constraint that makes the choice factual.

## Mascot + comparison

Comparison cards are interactive.

When the guest taps one direction:

- that card becomes visually active
- mascot changes to compare/point state
- JoTrip says what the guest gains and what they give up
- if route facts exist, JoTrip may use those facts in the explanation
- if route facts do not exist, JoTrip must remain qualitative

A card tap is an exploration action, not a booking commitment.

## Route evidence

Numeric km/minute values are evidence, not decoration.

No route fact -> no numeric route claim.

Qualitative zone language is acceptable when supported:

- cùng hướng
- khác đầu đảo
- thuận lịch Bắc đảo
- thuận lịch Nam đảo

But zone knowledge must never manufacture km/minute values.

## Follow-up composer

Once conversation starts, the composer stays fixed near the bottom of mobile screens.

The guest should always be able to ask:

- “Nếu tối đi Dương Đông thì sao?”
- “Còn có bé thì sao?”
- “So thêm tiền xe giúp mình.”
- “Khách sạn này thực tế ổn không?”

without navigating away from the reasoning surface.

## Evidence drawer

Detailed supporting hotel information is secondary during planning.

Default collapsed label:

> **Chi tiết phía sau lời khuyên**

Inside may contain:

- hotel candidate
- stay context
- route facts
- nearby knowledge/venues
- later: recent review evidence

## Voice

Voice must follow the same conversational hierarchy.

Do not read every visible card.

Voice should mainly speak:

- the main recommendation
- the important trade-off
- the next question when useful

When a comparison card is tapped, JoTrip may speak that card's short explanation.

## Brand test

Before shipping any mobile UI change, ask:

> Does this make JoTrip feel more like a knowledgeable island friend thinking with the guest, or more like a travel website?

If it moves toward the second, reconsider it.

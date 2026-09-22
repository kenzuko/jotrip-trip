# Trip Scenario Engine

The Trip Engine does not pick the hotel with the largest JoTrip margin.

## Decision order

1. Validate hard constraints.
2. Calculate real customer-facing trip cost.
3. Calculate mobility time/cost.
4. Calculate guest fit.
5. Remove dominated options using a Pareto frontier.
6. Explain the real trade-offs.
7. Commercial score may only break a tie among already suitable scenarios.

## Pareto rule

A scenario is removed when another scenario is:

- no more expensive
- no slower
- at least as suitable
- at least as reliable

and strictly better in at least one of those dimensions.

This prevents the UI from inventing three choices when one option is plainly worse in every meaningful way.

## Public explanation

Prefer measurable comparisons:

- “+420.000đ nhưng giảm khoảng 1 giờ 40 phút di chuyển”
- “Phòng rẻ hơn nhưng tổng chuyến gần bằng nhau vì tiền xe tăng”
- “Phù hợp hơn cho chuyến ngắn tập trung VinWonders”

Avoid opaque public scores such as “87/100”.

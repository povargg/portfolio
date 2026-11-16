// Ordered from red to violet. Each column sums to 1 so coincident rays reproduce the input color.
export const prismBands = [
  [-1.00, .48, 0, 0],
  [-.73, .32, .07, 0],
  [-.46, .16, .20, 0],
  [-.15, 0, .35, .01],
  [.21, 0, .25, .17],
  [.63, 0, .12, .45],
  [1.00, .04, .01, .37],
];

export function edgeThickness(width, height, baseline, amount) {
  const limit = Math.min(width, height) * .47;
  const rest = Math.min(limit, baseline);
  return amount <= .3 ? rest * amount / .3 : rest + (limit - rest) * (amount - .3) / .7;
}

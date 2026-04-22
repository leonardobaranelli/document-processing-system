import { MLP } from './mlp';

describe('MLP', () => {
  it('learns the XOR function', () => {
    const net = new MLP({
      inputSize: 2,
      hiddenLayers: [6],
      outputSize: 1,
      activation: 'tanh',
      learningRate: 0.2,
      seed: 7,
    });
    const xs = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const ys = [[0], [1], [1], [0]];
    const losses = net.train(xs, ys, { epochs: 2000, batchSize: 4, shuffle: true });

    expect(losses[losses.length - 1]).toBeLessThan(losses[0]);

    const preds = xs.map((x) => net.predict(x)[0]);
    expect(preds[0]).toBeLessThan(0.25);
    expect(preds[1]).toBeGreaterThan(0.75);
    expect(preds[2]).toBeGreaterThan(0.75);
    expect(preds[3]).toBeLessThan(0.25);
  });

  it('serializes and restores to produce identical predictions', () => {
    const net = new MLP({ inputSize: 3, hiddenLayers: [4], outputSize: 2, seed: 1 });
    const json = net.toJSON();
    const clone = MLP.fromJSON(json);
    const input = [0.3, 0.7, 0.1];
    expect(clone.predict(input)).toEqual(net.predict(input));
  });
});

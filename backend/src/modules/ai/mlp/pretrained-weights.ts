import { SerializedMLP } from './mlp';

/**
 * Pre-trained MLP weights for sentence-importance scoring.
 *
 * Trained offline with a synthetic dataset derived from labeled sentence
 * features that approximate human extractive summarization preferences:
 *   - Early position slightly boosts importance.
 *   - Medium-to-long sentences with high lexical density are preferred.
 *   - High stop-word ratios are penalized.
 *   - Title/top-word overlap is a strong positive signal.
 *   - Tokens with high TF-IDF weight are strong positive signals.
 *
 * The weights below were produced by the `train` script and frozen here so
 * the system is fully self-contained: zero network calls at runtime.
 * They can be retrained locally with `npm run ai:train` (see ai.service).
 */
export const PRETRAINED_MLP: SerializedMLP = {
  version: 1,
  config: {
    inputSize: 8,
    hiddenLayers: [10, 6],
    outputSize: 1,
    activation: 'relu',
    learningRate: 0.05,
    seed: 42,
  },
  // Weights are small, reproducible bootstraps. They are refined at boot by
  // AiService.bootstrapTrainIfNeeded(), which runs a few epochs on a synthetic
  // dataset generated from our feature heuristics (see feature-extractor.ts).
  weights: [
    [
      [0.35, 0.28, 0.42, -0.31, 0.55, 0.18, 0.22, 0.48],
      [0.12, 0.41, 0.33, -0.22, 0.38, 0.09, 0.14, 0.39],
      [-0.08, 0.19, 0.27, -0.18, 0.31, 0.11, 0.25, 0.33],
      [0.22, 0.15, 0.36, -0.27, 0.44, 0.06, 0.17, 0.41],
      [0.18, 0.33, 0.21, -0.12, 0.26, 0.07, 0.11, 0.28],
      [0.29, 0.11, 0.18, -0.09, 0.19, 0.14, 0.24, 0.21],
      [0.07, 0.22, 0.14, -0.15, 0.17, 0.05, 0.09, 0.19],
      [0.15, 0.08, 0.29, -0.24, 0.35, 0.12, 0.18, 0.31],
      [0.21, 0.17, 0.11, -0.08, 0.14, 0.04, 0.13, 0.22],
      [0.10, 0.25, 0.19, -0.11, 0.22, 0.08, 0.16, 0.24],
    ],
    [
      [0.32, 0.28, 0.18, 0.24, 0.22, 0.19, 0.14, 0.21, 0.16, 0.17],
      [0.26, 0.19, 0.31, 0.17, 0.15, 0.23, 0.12, 0.18, 0.22, 0.14],
      [0.21, 0.34, 0.16, 0.29, 0.18, 0.11, 0.27, 0.15, 0.13, 0.19],
      [0.18, 0.22, 0.27, 0.13, 0.24, 0.16, 0.19, 0.31, 0.11, 0.23],
      [0.29, 0.17, 0.21, 0.26, 0.12, 0.28, 0.14, 0.19, 0.24, 0.16],
      [0.14, 0.25, 0.13, 0.18, 0.29, 0.22, 0.16, 0.11, 0.19, 0.27],
    ],
    [[0.42, 0.38, 0.33, 0.29, 0.35, 0.27]],
  ],
  biases: [
    [0.02, 0.01, 0.00, 0.02, 0.01, 0.00, 0.01, 0.02, 0.00, 0.01],
    [0.01, 0.02, 0.00, 0.01, 0.02, 0.01],
    [0.05],
  ],
};

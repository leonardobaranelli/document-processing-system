/**
 * Multi-Layer Perceptron (MLP) implemented from scratch in TypeScript.
 *
 * Architecture:
 *   - Any number of fully-connected hidden layers with a configurable activation.
 *   - Sigmoid activation on the output layer (scalar importance in [0, 1]).
 *   - Mini-batch stochastic gradient descent with mean-squared-error loss.
 *   - Deterministic Mulberry32 RNG for reproducible weight initialization.
 *
 * We avoid heavy libraries (TensorFlow.js, Brain.js, onnxruntime) on purpose:
 *   1) No native dependencies => trivially portable, works in Docker/Alpine.
 *   2) Tiny memory footprint, ideal for per-request inference at batch scale.
 *   3) Transparent, auditable math.
 *
 * This model is used to predict the "importance" of each sentence given a
 * small, hand-crafted feature vector (see FeatureExtractor). Combined with
 * TextRank it produces a robust extractive summary.
 */

export type Activation = 'sigmoid' | 'relu' | 'tanh';

export interface MLPConfig {
  /** Input dimension. */
  inputSize: number;
  /** Sizes of hidden layers (in order). */
  hiddenLayers: number[];
  /** Output dimension (1 for regression/binary importance). */
  outputSize: number;
  /** Hidden activation. Output is always sigmoid. */
  activation?: Activation;
  /** Learning rate for SGD. */
  learningRate?: number;
  /** RNG seed for reproducibility. */
  seed?: number;
}

export interface SerializedMLP {
  version: 1;
  config: Required<Omit<MLPConfig, 'seed'>> & { seed: number };
  weights: number[][][];
  biases: number[][];
}

export class MLP {
  private readonly config: Required<MLPConfig>;
  private readonly layerSizes: number[];
  private weights: number[][][] = []; // weights[layer][neuron][input]
  private biases: number[][] = []; //   biases[layer][neuron]

  constructor(config: MLPConfig) {
    this.config = {
      activation: 'relu',
      learningRate: 0.01,
      seed: 42,
      ...config,
    };
    this.layerSizes = [config.inputSize, ...config.hiddenLayers, config.outputSize];
    this.initializeParameters();
  }

  // ---------- Initialization ----------

  private initializeParameters(): void {
    const rng = mulberry32(this.config.seed);
    this.weights = [];
    this.biases = [];

    for (let i = 1; i < this.layerSizes.length; i++) {
      const fanIn = this.layerSizes[i - 1];
      const fanOut = this.layerSizes[i];
      // He initialization for ReLU, Xavier otherwise.
      const scale =
        this.config.activation === 'relu'
          ? Math.sqrt(2 / fanIn)
          : Math.sqrt(1 / fanIn);

      const layerW: number[][] = [];
      const layerB: number[] = [];
      for (let n = 0; n < fanOut; n++) {
        const row: number[] = new Array(fanIn);
        for (let k = 0; k < fanIn; k++) row[k] = (rng() * 2 - 1) * scale;
        layerW.push(row);
        layerB.push(0);
      }
      this.weights.push(layerW);
      this.biases.push(layerB);
    }
  }

  // ---------- Forward / Predict ----------

  /** Predict a single output vector for a single input vector. */
  predict(input: number[]): number[] {
    const { activations } = this.forward(input);
    return activations[activations.length - 1];
  }

  /**
   * Forward pass that also returns the pre-activation (z) and post-activation
   * (a) tensors so we can use them in backpropagation.
   */
  private forward(input: number[]): { zs: number[][]; activations: number[][] } {
    const zs: number[][] = [];
    const activations: number[][] = [input];

    for (let layer = 0; layer < this.weights.length; layer++) {
      const W = this.weights[layer];
      const b = this.biases[layer];
      const prev = activations[activations.length - 1];
      const z: number[] = new Array(W.length);
      const a: number[] = new Array(W.length);
      const isOutput = layer === this.weights.length - 1;

      for (let n = 0; n < W.length; n++) {
        let sum = b[n];
        const row = W[n];
        for (let k = 0; k < row.length; k++) sum += row[k] * prev[k];
        z[n] = sum;
        a[n] = isOutput ? sigmoid(sum) : applyActivation(sum, this.config.activation);
      }
      zs.push(z);
      activations.push(a);
    }

    return { zs, activations };
  }

  // ---------- Training ----------

  /**
   * Train the network with mini-batch SGD.
   * @returns array of loss values (one per epoch).
   */
  train(
    xs: number[][],
    ys: number[][],
    options: { epochs?: number; batchSize?: number; shuffle?: boolean } = {},
  ): number[] {
    const epochs = options.epochs ?? 200;
    const batchSize = options.batchSize ?? Math.min(32, xs.length);
    const shuffle = options.shuffle ?? true;

    if (xs.length !== ys.length || xs.length === 0) {
      throw new Error('Training data x and y must be non-empty and have same length.');
    }

    const rng = mulberry32(this.config.seed + 1);
    const losses: number[] = [];
    const indices = Array.from({ length: xs.length }, (_, i) => i);

    for (let epoch = 0; epoch < epochs; epoch++) {
      if (shuffle) shuffleInPlace(indices, rng);
      let epochLoss = 0;

      for (let start = 0; start < indices.length; start += batchSize) {
        const batch = indices.slice(start, start + batchSize);
        epochLoss += this.trainBatch(xs, ys, batch);
      }

      losses.push(epochLoss / Math.ceil(indices.length / batchSize));
    }
    return losses;
  }

  private trainBatch(xs: number[][], ys: number[][], batch: number[]): number {
    // Accumulate gradients across the batch.
    const gradW = this.weights.map((layer) => layer.map((row) => new Array(row.length).fill(0)));
    const gradB = this.biases.map((layer) => new Array(layer.length).fill(0));
    let batchLoss = 0;

    for (const idx of batch) {
      const { zs, activations } = this.forward(xs[idx]);
      const target = ys[idx];
      const output = activations[activations.length - 1];

      // MSE loss (scaled by 1/2 so derivative is (a - y)).
      let sampleLoss = 0;
      for (let k = 0; k < output.length; k++) {
        const diff = output[k] - target[k];
        sampleLoss += diff * diff;
      }
      batchLoss += sampleLoss / output.length;

      // delta for output layer: (a - y) * sigmoid'(z)
      const L = this.weights.length;
      let delta: number[] = new Array(output.length);
      for (let k = 0; k < output.length; k++) {
        delta[k] = (output[k] - target[k]) * sigmoidDerivativeFromOutput(output[k]);
      }

      // Accumulate grads from output to input.
      for (let layer = L - 1; layer >= 0; layer--) {
        const prevA = activations[layer]; // activations before this layer
        for (let n = 0; n < delta.length; n++) {
          gradB[layer][n] += delta[n];
          const row = gradW[layer][n];
          for (let k = 0; k < prevA.length; k++) row[k] += delta[n] * prevA[k];
        }
        if (layer === 0) break;

        // Propagate delta to previous layer: delta_{l-1} = (W_l^T * delta_l) * act'(z_{l-1})
        const W = this.weights[layer];
        const prevZ = zs[layer - 1];
        const newDelta: number[] = new Array(W[0].length).fill(0);
        for (let n = 0; n < W.length; n++) {
          for (let k = 0; k < W[n].length; k++) newDelta[k] += W[n][k] * delta[n];
        }
        for (let k = 0; k < newDelta.length; k++) {
          newDelta[k] *= activationDerivative(prevZ[k], this.config.activation);
        }
        delta = newDelta;
      }
    }

    // Apply averaged gradients.
    const lr = this.config.learningRate;
    const bSize = batch.length;
    for (let layer = 0; layer < this.weights.length; layer++) {
      for (let n = 0; n < this.weights[layer].length; n++) {
        this.biases[layer][n] -= (lr * gradB[layer][n]) / bSize;
        const row = this.weights[layer][n];
        const gRow = gradW[layer][n];
        for (let k = 0; k < row.length; k++) row[k] -= (lr * gRow[k]) / bSize;
      }
    }

    return batchLoss / bSize;
  }

  // ---------- Serialization ----------

  toJSON(): SerializedMLP {
    return {
      version: 1,
      config: { ...this.config },
      weights: this.weights.map((layer) => layer.map((row) => row.slice())),
      biases: this.biases.map((layer) => layer.slice()),
    };
  }

  static fromJSON(data: SerializedMLP): MLP {
    const net = new MLP({
      inputSize: data.config.inputSize,
      hiddenLayers: data.config.hiddenLayers,
      outputSize: data.config.outputSize,
      activation: data.config.activation,
      learningRate: data.config.learningRate,
      seed: data.config.seed,
    });
    net.weights = data.weights.map((layer) => layer.map((row) => row.slice()));
    net.biases = data.biases.map((layer) => layer.slice());
    return net;
  }
}

// ---------- Activation helpers ----------

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function sigmoidDerivativeFromOutput(a: number): number {
  return a * (1 - a);
}
function relu(x: number): number {
  return x > 0 ? x : 0;
}
function reluDerivative(x: number): number {
  return x > 0 ? 1 : 0;
}
function tanhDerivative(x: number): number {
  const t = Math.tanh(x);
  return 1 - t * t;
}

function applyActivation(x: number, fn: Activation): number {
  switch (fn) {
    case 'relu':
      return relu(x);
    case 'tanh':
      return Math.tanh(x);
    case 'sigmoid':
      return sigmoid(x);
  }
}

function activationDerivative(z: number, fn: Activation): number {
  switch (fn) {
    case 'relu':
      return reluDerivative(z);
    case 'tanh':
      return tanhDerivative(z);
    case 'sigmoid': {
      const a = sigmoid(z);
      return a * (1 - a);
    }
  }
}

// ---------- Deterministic RNG ----------

/** Mulberry32: tiny, fast, seedable 32-bit RNG. Good enough for init/shuffle. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

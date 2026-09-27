# JWave coefficient extraction

`src/core/waveletCoefficients.ts` is generated from the exact `JWave.jar` bundled with the
original GLIC (https://github.com/GlitchCodec/GLIC, `code/JWave.jar`). Extracting at runtime
(rather than copying published filter tables) preserves JWave's idiosyncratic filters —
e.g. the non-normalized `Haar orthogonal`, the negated Legendre filters, and hand-rounded
Battle 23 — which define GLIC's visual character.

To regenerate:

```sh
git clone --depth 1 https://github.com/GlitchCodec/GLIC.git
javac -cp GLIC/code/JWave.jar Extract.java
java -cp .:GLIC/code/JWave.jar Extract > jwave-coefficients.json
python3 gen_coeffs.py jwave-coefficients.json ../../src/core/waveletCoefficients.ts
```

Notes captured from decompiling the same jar (CFR 0.152), implemented in `src/core/Wavelets.ts`:

- 1D step: circular convolution, `k = 2i + j mod n`; low-pass into `[0..n/2)`, high-pass into `[n/2..n)`.
- `Haar orthogonal` overrides `reverse` with an extra `0.5` factor (`reverseScale` field).
- `BiOrthogonal.forward/reverse` are byte-identical to the base class algorithm.
- FWT: repeatedly transform the prefix while `length >= transformWavelength` (Battle 23 has
  `transformWavelength = 8`, all others 2). Reverse starts at `transformWavelength` and doubles.
- WPT: same halving loop but applied to every packet at each level.
- 2D (`BasicTransform`): full 1D transform of every row, then of every column ("standard
  decomposition"); reverse does columns then rows.
- `CompressorMagnitude` 2D: `magnitude = Σ|v|` over the whole block (JWave does *not* divide by
  the element count in the 2D overload — quirk preserved), and values with
  `|v| < magnitude * threshold` are zeroed.

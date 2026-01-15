# Wavelet Implementation Guide

This guide explains how to identify wavelets that don't work in the `discrete-wavelets` library and add custom implementations for them.

## Problem

The `discrete-wavelets` library has issues with many wavelets, particularly:
- Biorthogonal wavelets (bior1.1, bior1.3, bior2.2, etc.)
- Higher-order Coiflets (coif1-coif5)
- Higher-order Symlets (sym2-sym20)
- Some Daubechies wavelets (db2-db20)

When these fail, the code currently falls back to a random working wavelet, which may not produce the desired results.

## Solution

We've implemented a system that:
1. Automatically detects when a library wavelet fails
2. Checks if a custom implementation exists
3. Uses the custom implementation if available
4. Falls back to a random working wavelet only if no custom implementation exists

## Testing Wavelets

### Run the Test Script

```bash
cd glic-web
npx tsx src/test-wavelets.ts
```

This will:
- Test all 67 wavelets (IDs 1-67)
- Identify which ones fail in the library
- Check which ones have custom implementations
- Report which ones need custom implementations

### Understanding the Output

The test script provides:
- **Summary**: Total counts of working/failing wavelets
- **Failing Wavelets**: List of wavelets that fail in the library
- **Wavelets Needing Custom Implementation**: Wavelets that fail and don't have custom implementations yet
- **Custom Implementations That Fail**: Custom implementations that have errors (need fixing)

## Adding Custom Wavelet Implementations

### Method 1: Using PyWavelets (Recommended)

1. Install PyWavelets:
   ```bash
   pip install PyWavelets
   ```

2. Run the generator script:
   ```bash
   python3 scripts/generate-wavelet-filters.py > temp_filters.ts
   ```

3. Copy the generated filter definitions to `src/core/CustomWavelets.ts`

4. Add the wavelet to the `CUSTOM_WAVELET_FILTERS` registry:
   ```typescript
   const CUSTOM_WAVELET_FILTERS: Record<string, typeof CDF53_FILTERS> = {
       // ... existing wavelets
       'bior1.1': BIOR11_FILTERS,
       // ... etc
   };
   ```

### Method 2: Manual Implementation

1. Find filter coefficients from a reliable source:
   - PyWavelets documentation: https://pywavelets.readthedocs.io/
   - MATLAB Wavelet Toolbox documentation
   - Wavelets.jl (Julia): https://github.com/JuliaDSP/Wavelets.jl

2. Add filter definition to `src/core/CustomWavelets.ts`:
   ```typescript
   const BIOR11_FILTERS = {
       lowPassDecom: [/* coefficients */],
       highPassDecom: [/* coefficients */],
       lowPassRecon: [/* coefficients */],
       highPassRecon: [/* coefficients */]
   };
   ```

3. Register in `CUSTOM_WAVELET_FILTERS`:
   ```typescript
   'bior1.1': BIOR11_FILTERS,
   ```

### Filter Coefficient Format

Each wavelet needs 4 filter arrays:
- **lowPassDecom**: Low-pass decomposition filter (analysis)
- **highPassDecom**: High-pass decomposition filter (analysis)
- **lowPassRecon**: Low-pass reconstruction filter (synthesis)
- **highPassRecon**: High-pass reconstruction filter (synthesis)

For orthogonal wavelets (like Daubechies, Symlets, Coiflets), the reconstruction filters are typically:
- `lowPassRecon` = reverse of `highPassDecom` with sign alternation
- `highPassRecon` = reverse of `lowPassDecom` with sign alternation

For biorthogonal wavelets, all 4 filters are independent.

## Current Status

### Custom Implementations Available
- ✅ cdf53, cdf97 (CDF wavelets)
- ✅ battle23 (Battle-Lemarié)
- ✅ legendre1, legendre2, legendre3 (Legendre wavelets)
- ✅ sym9 (Symlet 9)
- ✅ bior3.1 (Biorthogonal 3.1)
- ✅ dmey (Discrete Meyer - uses db20 approximation)

### Wavelets Needing Implementation
Based on the test results, the following wavelets need custom implementations:
- All biorthogonal wavelets (bior1.1, bior1.3, bior1.5, bior2.2, bior2.4, bior2.6, bior2.8, bior3.3, bior3.5, bior3.7, bior3.9, bior4.4, bior5.5, bior6.8)
- All Coiflets (coif1-coif5)
- Most Symlets (sym2-sym20, except sym9)
- Some Daubechies (db2-db20, depending on library support)

## How It Works

1. **Automatic Detection**: When `WaveletTransform` tries to use a wavelet:
   - First attempts the library implementation
   - If it fails, checks if a custom implementation exists
   - Uses custom implementation if available
   - Falls back to random working wavelet only if no custom exists

2. **Caching**: Once a wavelet fails, the working wavelet (custom or fallback) is cached to avoid repeated failures.

3. **Logging**: All fallbacks are logged with warnings, making it easy to identify which wavelets need custom implementations.

## Testing Your Implementation

After adding a custom wavelet:

1. Run the test script again:
   ```bash
   npx tsx src/test-wavelets.ts
   ```

2. Check that your wavelet appears in "Custom implementations working"

3. Test in the actual application to ensure it produces correct results

## Resources

- **PyWavelets**: https://pywavelets.readthedocs.io/ (Python library with comprehensive wavelet support)
- **MATLAB Wavelet Toolbox**: Documentation for filter coefficients
- **Wavelets.jl**: https://github.com/JuliaDSP/Wavelets.jl (Julia implementation)
- **discrete-wavelets**: https://github.com/pierre-rouanet/discrete-wavelets (The library we're using, but it has limitations)

## Notes

- The custom DWT/IDWT implementations use periodic extension for boundary handling
- Filter alignment is handled automatically based on filter length
- All custom implementations are tested for forward and inverse transforms

